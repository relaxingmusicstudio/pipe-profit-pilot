/**
 * Event Processor - System Contract v1.2.0 (Hardened)
 * 
 * Processes canonical events from the event bus with budget controls.
 * Currently implements: cold_agent_enroller consumer for lead_created events.
 * 
 * Query Params:
 *   - consumer: Consumer name (default: cold_agent_enroller)
 *   - event_type: Event type to process (default: lead_created)
 *   - limit: Max events to process (default: 10)
 *   - max_ms: Max runtime in milliseconds (default: 8000)
 *   - run_id: Optional run identifier (generated if missing)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  claimEvents,
  markProcessed,
  markFailed,
  emitEvent,
  getAutopilotMode,
  getSupabaseAdmin,
  type SystemEvent,
} from "../_shared/event-bus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// TYPES
// ============================================

type StopReason = 'limit_reached' | 'timeout' | 'no_events' | 'claim_error' | 'completed';

interface ProcessorResult {
  success: boolean;
  run_id: string;
  consumer: string;
  event_type: string;
  processed: number;
  failed: number;
  stopped_reason: StopReason;
  elapsed_ms: number;
  errors: string[];
}

interface EventLog {
  run_id: string;
  consumer: string;
  event_type: string;
  event_id: string;
  status_before: string;
  outcome: 'processed' | 'failed' | 'skipped';
  attempts: number;
  duration_ms: number;
  error?: string;
}

// ============================================
// STRUCTURED LOGGING
// ============================================

function logEvent(log: EventLog): void {
  console.log(JSON.stringify({
    level: 'INFO',
    type: 'event_processed',
    ...log,
    timestamp: new Date().toISOString(),
  }));
}

// ============================================
// CONSUMER: COLD AGENT ENROLLER
// ============================================

async function processLeadCreatedForColdAgent(event: SystemEvent): Promise<void> {
  const supabase = getSupabaseAdmin();
  const leadId = event.payload?.lead_id ?? event.entity_id;
  const payload = event.payload as {
    lead_id?: string;
    source?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    consent_status?: {
      call: boolean;
      sms: boolean;
      email: boolean;
    };
    lead_score?: number;
    tenant_id?: string;
  };

  // 1. Check autopilot mode (fail-safe to MANUAL if missing/error)
  const autopilotMode = await getAutopilotMode(event.tenant_id ?? undefined);

  if (autopilotMode === 'MANUAL') {
    // Queue for CEO approval instead of auto-enrolling
    
    // IDEMPOTENCY GUARD: Check if pending/approved approval already exists for this lead
    const { data: existingAction } = await supabase
      .from('ceo_action_queue')
      .select('id, status')
      .eq('action_type', 'approve_cold_enrollment')
      .eq('target_id', leadId)
      .in('status', ['pending', 'approved'])
      .maybeSingle();
    
    if (existingAction) {
      return; // Already exists, skip silently
    }
    
    const queuePayload: Record<string, unknown> = {
      lead_id: leadId,
      source: payload.source,
      recommended_sequence: 'default_cold',
    };
    
    // Include UTM fields only if present
    if (payload.utm_source) queuePayload.utm_source = payload.utm_source;
    if (payload.utm_medium) queuePayload.utm_medium = payload.utm_medium;
    if (payload.utm_campaign) queuePayload.utm_campaign = payload.utm_campaign;
    if (payload.utm_term) queuePayload.utm_term = payload.utm_term;
    if (payload.utm_content) queuePayload.utm_content = payload.utm_content;
    if (payload.consent_status) queuePayload.consent_status = payload.consent_status;
    if (payload.lead_score !== undefined) queuePayload.lead_score = payload.lead_score;
    
    const { error: queueError } = await supabase.from('ceo_action_queue').insert({
      action_type: 'approve_cold_enrollment',
      target_type: 'lead',
      target_id: leadId,
      tenant_id: event.tenant_id,
      payload: queuePayload,
      priority: 'normal',
      status: 'pending',
      source: 'event_processor',
      claude_reasoning: `New lead ${leadId} requires CEO approval for cold sequence enrollment (MANUAL mode).`,
    });
    
    // DB-LEVEL IDEMPOTENCY: Handle unique constraint violation (23505) as success
    if (queueError) {
      if (queueError.code === '23505') {
        return; // Duplicate, treat as success
      }
      throw new Error(`Failed to queue CEO action: ${queueError.message}`);
    }
    return;
  }

  // 2. ASSISTED or FULL mode - proceed with auto-enrollment
  const leadScore = payload.lead_score ?? 0;

  // 3. Get first active cold_outreach sequence
  const { data: sequence, error: seqError } = await supabase
    .from('sequences')
    .select('id, name')
    .eq('trigger_type', 'cold_outreach')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (seqError || !sequence) {
    // Record the skipped enrollment in action_history
    await supabase.from('action_history').insert({
      action_table: 'sequence_enrollments',
      action_id: crypto.randomUUID(),
      action_type: 'enrollment_skipped',
      target_type: 'lead',
      target_id: leadId,
      actor_type: 'module',
      actor_module: 'cold_agent_enroller',
      new_state: { 
        reason: 'no_active_sequence', 
        lead_score: leadScore,
        autopilot_mode: autopilotMode,
      },
    });
    return;
  }

  // 4. Check if already enrolled (idempotency)
  const { data: existingEnrollment } = await supabase
    .from('sequence_enrollments')
    .select('id')
    .eq('lead_id', leadId)
    .eq('sequence_id', sequence.id)
    .maybeSingle();

  if (existingEnrollment) {
    return; // Already enrolled
  }

  // 5. Create enrollment
  const { data: enrollment, error: enrollError } = await supabase
    .from('sequence_enrollments')
    .insert({
      lead_id: leadId,
      sequence_id: sequence.id,
      status: 'active',
      current_step: 0,
      tenant_id: event.tenant_id,
    })
    .select('id')
    .single();

  if (enrollError) {
    throw new Error(`Failed to enroll lead: ${enrollError.message}`);
  }

  // 6. Audit the enrollment in action_history
  await supabase.from('action_history').insert({
    action_table: 'sequence_enrollments',
    action_id: enrollment.id,
    action_type: 'cold_enrollment',
    target_type: 'lead',
    target_id: leadId,
    actor_type: 'module',
    actor_module: 'cold_agent_enroller',
    new_state: {
      sequence_id: sequence.id,
      sequence_name: sequence.name,
      lead_score: leadScore,
      autopilot_mode: autopilotMode,
    },
  });

  // 7. Emit cold_sequence_enrolled event for downstream consumers
  await emitEvent({
    eventType: 'cold_sequence_enrolled',
    entityType: 'sequence_enrollment',
    entityId: enrollment.id,
    payload: {
      lead_id: leadId,
      sequence_id: sequence.id,
      sequence_name: sequence.name,
      enrolled_by: 'cold_agent_enroller',
    },
    emittedBy: 'cold_agent_enroller',
    tenantId: event.tenant_id,
    idempotencyKey: `cold_sequence_enrolled:${leadId}:${sequence.id}`,
  });
}

// ============================================
// MAIN PROCESSOR WITH BUDGET CONTROLS
// ============================================

async function processEvents(
  runId: string,
  consumerName: string, 
  eventType: string,
  limit: number,
  maxMs: number,
  startTime: number
): Promise<ProcessorResult> {
  const result: ProcessorResult = {
    success: true,
    run_id: runId,
    consumer: consumerName,
    event_type: eventType,
    processed: 0,
    failed: 0,
    stopped_reason: 'completed',
    elapsed_ms: 0,
    errors: [],
  };

  // Claim events atomically using claim_system_events RPC
  const { events, error: claimError } = await claimEvents({
    consumerName,
    eventType,
    limit,
  });

  if (claimError) {
    result.success = false;
    result.stopped_reason = 'claim_error';
    result.errors.push(`claim: ${claimError}`);
    result.elapsed_ms = Date.now() - startTime;
    return result;
  }

  if (events.length === 0) {
    result.stopped_reason = 'no_events';
    result.elapsed_ms = Date.now() - startTime;
    return result;
  }

  // Process each claimed event with budget checks
  for (const event of events) {
    const eventStart = Date.now();
    const statusBefore = event.status;

    // CHECK TIMEOUT BUDGET before processing
    const elapsedSoFar = Date.now() - startTime;
    if (elapsedSoFar >= maxMs) {
      result.stopped_reason = 'timeout';
      result.elapsed_ms = elapsedSoFar;
      // Note: We already claimed these events, they'll stay in 'processing' 
      // and be picked up by next run after claim_system_events resets them
      console.log(JSON.stringify({
        level: 'WARN',
        type: 'processor_timeout',
        run_id: runId,
        consumer: consumerName,
        elapsed_ms: elapsedSoFar,
        max_ms: maxMs,
        events_remaining: events.length - (result.processed + result.failed),
      }));
      break;
    }

    // CHECK LIMIT BUDGET
    if (result.processed + result.failed >= limit) {
      result.stopped_reason = 'limit_reached';
      break;
    }

    try {
      // Route to appropriate handler based on consumer
      switch (consumerName) {
        case 'cold_agent_enroller':
          await processLeadCreatedForColdAgent(event);
          break;
        default:
          // Unknown consumer - skip but don't fail
          logEvent({
            run_id: runId,
            consumer: consumerName,
            event_type: eventType,
            event_id: event.id,
            status_before: statusBefore,
            outcome: 'skipped',
            attempts: event.attempts,
            duration_ms: Date.now() - eventStart,
            error: `Unknown consumer: ${consumerName}`,
          });
          continue;
      }

      // Mark as processed via mark_event_processed RPC
      await markProcessed(event.id, consumerName);
      result.processed++;

      logEvent({
        run_id: runId,
        consumer: consumerName,
        event_type: eventType,
        event_id: event.id,
        status_before: statusBefore,
        outcome: 'processed',
        attempts: event.attempts,
        duration_ms: Date.now() - eventStart,
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Mark failed via mark_event_failed RPC (handles backoff + dead-lettering)
      const failResult = await markFailed(event.id, consumerName, errorMessage);
      result.failed++;
      result.errors.push(`${event.id}: ${errorMessage}`);

      logEvent({
        run_id: runId,
        consumer: consumerName,
        event_type: eventType,
        event_id: event.id,
        status_before: statusBefore,
        outcome: 'failed',
        attempts: event.attempts,
        duration_ms: Date.now() - eventStart,
        error: errorMessage,
      });
      
      if (failResult.deadLettered) {
        console.log(JSON.stringify({
          level: 'WARN',
          type: 'event_dead_lettered',
          run_id: runId,
          event_id: event.id,
          consumer: consumerName,
        }));
      }
    }
  }

  result.elapsed_ms = Date.now() - startTime;
  
  // If we processed everything without hitting limits
  if (result.stopped_reason === 'completed' && result.processed + result.failed === events.length) {
    result.stopped_reason = 'completed';
  }

  return result;
}

// ============================================
// HTTP HANDLER
// ============================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const url = new URL(req.url);
    
    // Parse query params with defaults
    const consumer = url.searchParams.get('consumer') ?? 'cold_agent_enroller';
    const eventType = url.searchParams.get('event_type') ?? 'lead_created';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '10', 10), 100); // Cap at 100
    const maxMs = Math.min(parseInt(url.searchParams.get('max_ms') ?? '8000', 10), 55000); // Cap at 55s (edge function limit)
    const runId = url.searchParams.get('run_id') ?? crypto.randomUUID();

    console.log(JSON.stringify({
      level: 'INFO',
      type: 'processor_start',
      run_id: runId,
      consumer,
      event_type: eventType,
      limit,
      max_ms: maxMs,
    }));

    const result = await processEvents(runId, consumer, eventType, limit, maxMs, startTime);

    console.log(JSON.stringify({
      level: 'INFO',
      type: 'processor_complete',
      run_id: runId,
      consumer,
      processed: result.processed,
      failed: result.failed,
      stopped_reason: result.stopped_reason,
      elapsed_ms: result.elapsed_ms,
    }));

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    const runId = crypto.randomUUID();
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    console.log(JSON.stringify({
      level: 'ERROR',
      type: 'processor_fatal',
      run_id: runId,
      error: errorMessage,
      elapsed_ms: Date.now() - startTime,
    }));

    return new Response(
      JSON.stringify({
        success: false,
        run_id: runId,
        error: errorMessage,
        stopped_reason: 'error',
        elapsed_ms: Date.now() - startTime,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

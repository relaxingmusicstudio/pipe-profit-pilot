import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Lead Normalize Edge Function
 * 
 * Normalizes, deduplicates, and segments incoming leads.
 * Creates/updates lead_profiles with deterministic fingerprinting.
 * 
 * Auth: Bearer JWT (admin/owner) OR X-Internal-Secret for system calls
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface NormalizeRequest {
  tenant_id: string;
  lead: {
    email?: string;
    phone?: string;
    company_name?: string;
    first_name?: string;
    last_name?: string;
    job_title?: string;
    source?: string;
    raw?: Record<string, unknown>;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const internalSecret = Deno.env.get("INTERNAL_SCHEDULER_SECRET");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[lead-normalize] Missing Supabase config");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    // Auth check: JWT or internal secret
    const authHeader = req.headers.get("Authorization");
    const internalSecretHeader = req.headers.get("X-Internal-Secret");
    
    let isAuthorized = false;
    let userId: string | null = null;

    // Check internal secret first (for system-to-system calls)
    if (internalSecret && internalSecretHeader === internalSecret) {
      isAuthorized = true;
      userId = "system";
    }

    // Check JWT auth
    if (!isAuthorized && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });
      
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
      
      if (authError || !user) {
        console.warn("[lead-normalize] JWT auth failed", { error: authError?.message });
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Check user has admin or owner role
      const { data: roles } = await supabaseAuth
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const hasRole = roles?.some(r => ["admin", "owner", "platform_admin"].includes(r.role));
      if (!hasRole) {
        return jsonResponse({ error: "Insufficient permissions" }, 403);
      }

      isAuthorized = true;
      userId = user.id;
    }

    if (!isAuthorized) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Parse request
    const body: NormalizeRequest = await req.json().catch(() => ({ tenant_id: "", lead: {} }));
    
    if (!body.tenant_id) {
      return jsonResponse({ error: "tenant_id is required" }, 400);
    }

    const { lead } = body;
    if (!lead.email && !lead.phone) {
      return jsonResponse({ error: "At least one of email or phone is required" }, 400);
    }

    // Create service role client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Validate tenant exists
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", body.tenant_id)
      .maybeSingle();

    if (tenantError || !tenant) {
      return jsonResponse({ error: "Invalid tenant_id" }, 400);
    }

    // Compute fingerprint using SQL function
    const { data: fpResult, error: fpError } = await supabase.rpc("compute_lead_fingerprint", {
      p_email: lead.email || null,
      p_phone: lead.phone || null,
      p_company_name: lead.company_name || null,
    });

    if (fpError) {
      console.error("[lead-normalize] Fingerprint computation failed", { error: fpError.message });
      return jsonResponse({ error: "Failed to compute fingerprint" }, 500);
    }

    const fingerprint = fpResult as string;

    // Get normalized values
    const { data: normEmail } = await supabase.rpc("normalize_email", { raw_email: lead.email || null });
    const { data: normPhone } = await supabase.rpc("normalize_phone", { raw_phone: lead.phone || null });

    // Determine segment (lightweight rules)
    let segment: "b2b" | "b2c" | "unknown" = "unknown";
    if (lead.company_name || lead.job_title) {
      segment = "b2b";
    } else if (lead.email && !lead.email.includes("@gmail.") && !lead.email.includes("@yahoo.") && !lead.email.includes("@hotmail.")) {
      // Non-consumer email domain hints at B2B
      segment = "b2b";
    } else if (lead.email || lead.phone) {
      // Has contact info but no business indicators
      segment = "b2c";
    }

    // Check if existing profile with same fingerprint exists
    const { data: existingProfile, error: existingError } = await supabase
      .from("lead_profiles")
      .select("id, lead_id, merged_from, enrichment_data")
      .eq("tenant_id", body.tenant_id)
      .eq("fingerprint", fingerprint)
      .eq("is_primary", true)
      .maybeSingle();

    if (existingError && existingError.code !== "PGRST116") {
      console.error("[lead-normalize] Profile lookup failed", { error: existingError.message });
      return jsonResponse({ error: "Database error during lookup" }, 500);
    }

    let leadId: string;
    let leadProfileId: string;
    let status: "created" | "deduped";

    if (existingProfile) {
      // DEDUP PATH: Update existing profile
      status = "deduped";
      leadProfileId = existingProfile.id;
      leadId = existingProfile.lead_id;

      // Merge enrichment data
      const existingEnrichment = existingProfile.enrichment_data || {};
      const newEnrichment = {
        ...existingEnrichment,
        last_seen_at: new Date().toISOString(),
        sources: [...(existingEnrichment.sources || []), lead.source].filter(Boolean),
      };

      // Update profile with merged data
      const { error: updateError } = await supabase
        .from("lead_profiles")
        .update({
          enrichment_data: newEnrichment,
          company_name: lead.company_name || existingProfile.enrichment_data?.company_name,
          job_title: lead.job_title || existingProfile.enrichment_data?.job_title,
          segment: segment !== "unknown" ? segment : undefined,
        })
        .eq("id", existingProfile.id);

      if (updateError) {
        console.error("[lead-normalize] Profile update failed", { error: updateError.message });
        return jsonResponse({ error: "Failed to update existing profile" }, 500);
      }

      // Log audit entry for normalization call
      await supabase.from("platform_audit_log").insert({
        tenant_id: body.tenant_id,
        timestamp: new Date().toISOString(),
        agent_name: "lead-normalize",
        action_type: "lead_normalize_called",
        entity_type: "lead",
        entity_id: leadId,
        description: `Lead normalized (deduped) - fingerprint: ${fingerprint}`,
        request_snapshot: { input: body, normalized: { email: normEmail, phone: normPhone } },
        response_snapshot: { status: "deduped", lead_profile_id: leadProfileId },
        success: true,
        user_id: userId !== "system" ? userId : null,
      });

    } else {
      // CREATE PATH: New lead + profile
      status = "created";

      // Build lead name
      const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";

      // Insert lead record
      const { data: newLead, error: leadError } = await supabase
        .from("leads")
        .insert({
          tenant_id: body.tenant_id,
          name: leadName,
          email: normEmail,
          phone: normPhone,
          business_name: lead.company_name,
          source: lead.source || "lead-normalize",
          status: "new",
          lead_temperature: "cold",
          metadata: { raw: lead.raw, normalized_at: new Date().toISOString() },
        })
        .select("id")
        .single();

      if (leadError) {
        console.error("[lead-normalize] Lead creation failed", { error: leadError.message });
        return jsonResponse({ error: "Failed to create lead" }, 500);
      }

      leadId = newLead.id;

      // Insert lead_profile
      const { data: newProfile, error: profileError } = await supabase
        .from("lead_profiles")
        .insert({
          lead_id: leadId,
          tenant_id: body.tenant_id,
          fingerprint,
          segment,
          temperature: "ice_cold",
          company_name: lead.company_name,
          job_title: lead.job_title,
          is_primary: true,
          enrichment_data: {
            sources: [lead.source].filter(Boolean),
            created_at: new Date().toISOString(),
          },
        })
        .select("id")
        .single();

      if (profileError) {
        console.error("[lead-normalize] Profile creation failed", { error: profileError.message });
        // Attempt to clean up lead
        await supabase.from("leads").delete().eq("id", leadId);
        return jsonResponse({ error: "Failed to create lead profile" }, 500);
      }

      leadProfileId = newProfile.id;

      // Log audit entry
      await supabase.from("platform_audit_log").insert({
        tenant_id: body.tenant_id,
        timestamp: new Date().toISOString(),
        agent_name: "lead-normalize",
        action_type: "lead_normalize_called",
        entity_type: "lead",
        entity_id: leadId,
        description: `Lead normalized (created) - fingerprint: ${fingerprint}`,
        request_snapshot: { input: body, normalized: { email: normEmail, phone: normPhone } },
        response_snapshot: { status: "created", lead_id: leadId, lead_profile_id: leadProfileId },
        success: true,
        user_id: userId !== "system" ? userId : null,
      });
    }

    console.log("[lead-normalize] Success", {
      status,
      tenant_id: body.tenant_id,
      lead_id: leadId,
      lead_profile_id: leadProfileId,
      fingerprint,
      duration_ms: Date.now() - startTime,
    });

    return jsonResponse({
      ok: true,
      status,
      tenant_id: body.tenant_id,
      lead_id: leadId,
      lead_profile_id: leadProfileId,
      fingerprint,
      segment,
      normalized: { email: normEmail, phone: normPhone },
      duration_ms: Date.now() - startTime,
    });

  } catch (error) {
    console.error("[lead-normalize] Unhandled error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

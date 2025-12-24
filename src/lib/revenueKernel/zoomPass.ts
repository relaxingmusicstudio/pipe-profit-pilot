export type ZoomGuarantee = {
  id: string;
  description: string;
};

export type ZoomEdge = {
  id: string;
  description: string;
  mitigation: string;
};

export type ZoomDone = {
  id: string;
  description: string;
};

export type ZoomEdgeMap = {
  edgeId: string;
  codeRef: string;
  testRef: string;
};

export const ZOOM_GUARANTEES: ZoomGuarantee[] = [
  { id: "intent_before_execution", description: "Intent declared before execution." },
  { id: "policy_preflight_gate", description: "Policy preflight gate runs for every action." },
  { id: "evidence_recorded", description: "Evidence is recorded for every action attempt." },
  { id: "cooldown_respected", description: "Cooldown and irreversibility are respected." },
  { id: "throttle_compliance", description: "Throttle and compliance caps are enforced." },
  { id: "paged_threads_ledger", description: "Threads and ledgers are paged, never fully loaded." },
];

export const ZOOM_EDGES: ZoomEdge[] = [
  { id: "consent_opt_out", description: "Consent/opt-out handling.", mitigation: "Consent gate + irreversible DNC." },
  { id: "deliverability_caps", description: "Deliverability/rate limit safety.", mitigation: "Throttle caps + warmup." },
  { id: "duplicate_leads", description: "Duplicate leads + merge.", mitigation: "Deterministic merge + merge ledger." },
  { id: "mock_vs_real", description: "Mock vs real proof.", mitigation: "Evidence schema + safe hold in LIVE." },
  { id: "schedule_optional", description: "Schedule optionality.", mitigation: "Close modes: no_meetings/optional." },
  { id: "offline_fulfillment", description: "Offline/hybrid fulfillment.", mitigation: "Task types + proof requirements." },
  { id: "burnout_overload", description: "User burnout/task overload.", mitigation: "Throttle + cooling-off checks." },
  { id: "sensitive_data", description: "Sensitive/private data boundaries.", mitigation: "Reachability + consent + DNC." },
];

export const ZOOM_DONE: ZoomDone[] = [
  { id: "pipeline_canonical", description: "Universal pipeline used for actions with proof bundle." },
  { id: "consent_gate", description: "Outreach blocked without consent; opt-out irreversible." },
  { id: "evidence_schema", description: "EvidenceRef schema enforced in mock and live." },
  { id: "stage_transitions", description: "Stage transitions ledgered with reasons." },
  { id: "pagination_guard", description: "Ledger/thread paging test prevents full load regressions." },
];

export const ZOOM_EDGE_MAP: ZoomEdgeMap[] = [
  { edgeId: "consent_opt_out", codeRef: "src/lib/revenueKernel/consent.ts", testRef: "tests/unit/revenueKernel.test.ts" },
  { edgeId: "deliverability_caps", codeRef: "src/lib/revenueKernel/throttle.ts", testRef: "tests/unit/revenueKernel.test.ts" },
  { edgeId: "duplicate_leads", codeRef: "src/lib/revenueKernel/leadMerge.ts", testRef: "tests/unit/revenueKernel.test.ts" },
  { edgeId: "mock_vs_real", codeRef: "src/lib/revenueKernel/evidence.ts", testRef: "tests/unit/revenueKernel.test.ts" },
  { edgeId: "schedule_optional", codeRef: "src/lib/revenueKernel/stages.ts", testRef: "tests/unit/revenueKernel.test.ts" },
  { edgeId: "offline_fulfillment", codeRef: "src/lib/revenueKernel/fulfillment.ts", testRef: "tests/unit/revenueKernel.test.ts" },
  { edgeId: "burnout_overload", codeRef: "src/lib/revenueKernel/lifecycle.ts", testRef: "tests/unit/revenueKernel.test.ts" },
  { edgeId: "sensitive_data", codeRef: "src/lib/revenueKernel/reachability.ts", testRef: "tests/unit/revenueKernel.test.ts" },
];

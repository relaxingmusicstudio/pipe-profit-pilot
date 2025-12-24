export type RiskRegisterEntry = {
  risk_id: string;
  description: string;
  trigger: string;
  mitigation: string;
  owner: string;
  status: "deferred" | "mitigated";
  review_cadence: string;
};

export const RISK_REGISTER: RiskRegisterEntry[] = [
  {
    risk_id: "auth-role-overload",
    description: "Supabase RPC role overload conflict (PGRST203) remains unresolved.",
    trigger: "Role check RPC fails with PGRST203.",
    mitigation: "Fix duplicate has_role overloads in DB layer.",
    owner: "platform",
    status: "deferred",
    review_cadence: "weekly",
  },
  {
    risk_id: "ceo-chat-panel-deferred",
    description: "CEO agent chat panel remains deferred in CEOHome.",
    trigger: "Phase 1 TODO in CEOHome not removed.",
    mitigation: "Implement chat mount in a dedicated iteration.",
    owner: "product",
    status: "deferred",
    review_cadence: "monthly",
  },
];

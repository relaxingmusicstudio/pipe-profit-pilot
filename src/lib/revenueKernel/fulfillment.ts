import type { EvidenceRef } from "./evidence";
import type { PolicyMode } from "../policyEngine";

export type FulfillmentTaskType =
  | "on_site_visit"
  | "phone_call"
  | "document_collection"
  | "production_step"
  | "review_step";

export type FulfillmentOwner = "human" | "agent";

export type FulfillmentTask = {
  task_id: string;
  lead_id: string;
  task_type: FulfillmentTaskType;
  owner: FulfillmentOwner;
  sla_hours: number;
  proof_required: boolean;
  requires_human_approval: boolean;
  status: "pending" | "blocked" | "completed";
  evidence_ref?: EvidenceRef;
};

export const completeFulfillmentTask = (
  task: FulfillmentTask,
  mode: PolicyMode,
  evidence_ref?: EvidenceRef
): { next: FulfillmentTask; blocked: boolean; reason?: string } => {
  if (task.requires_human_approval) {
    return {
      next: { ...task, status: "blocked" },
      blocked: true,
      reason: "HUMAN_APPROVAL_REQUIRED",
    };
  }

  if (task.proof_required && mode === "LIVE" && !evidence_ref?.response_id) {
    return {
      next: { ...task, status: "blocked" },
      blocked: true,
      reason: "MISSING_PROOF",
    };
  }

  return {
    next: { ...task, status: "completed", evidence_ref },
    blocked: false,
  };
};

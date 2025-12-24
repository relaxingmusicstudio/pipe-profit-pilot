import type { EvidenceRef } from "./evidence";

export type LeadStage = "cold" | "warm" | "hot" | "close" | "fulfill" | "onboard" | "retain" | "upsell";

export type StageSignal =
  | "lead_sourced"
  | "contact_attempted"
  | "engaged"
  | "qualified"
  | "converted"
  | "fulfillment_started"
  | "onboarding_started"
  | "retention_started"
  | "upsell_candidate";

export type StageTransition = {
  transition_id: string;
  from: LeadStage;
  to: LeadStage;
  reason: string;
  evidence_ref?: EvidenceRef;
  timestamp: string;
};

export type CloseMode = "no_meetings" | "meetings_optional" | "meetings_required";

export type QualificationPlan = {
  close_mode: CloseMode;
  steps: string[];
  notes: string;
};

const NEXT_BY_SIGNAL: Record<StageSignal, LeadStage> = {
  lead_sourced: "cold",
  contact_attempted: "warm",
  engaged: "warm",
  qualified: "hot",
  converted: "close",
  fulfillment_started: "fulfill",
  onboarding_started: "onboard",
  retention_started: "retain",
  upsell_candidate: "upsell",
};

export const transitionStage = (
  current: LeadStage,
  signal: StageSignal,
  timestamp: string,
  reason: string,
  evidence_ref?: EvidenceRef
): { nextStage: LeadStage; transition: StageTransition } => {
  const nextStage = NEXT_BY_SIGNAL[signal];
  const transition: StageTransition = {
    transition_id: `stage-${current}-${nextStage}-${timestamp}`,
    from: current,
    to: nextStage,
    reason,
    evidence_ref,
    timestamp,
  };

  return { nextStage, transition };
};

export const buildQualificationPlan = (mode: CloseMode): QualificationPlan => {
  if (mode === "no_meetings") {
    return {
      close_mode: mode,
      steps: ["Provide trust assets", "Share interactive sales page", "Send follow-up cadence"],
      notes: "No meetings required; deliver proof and clear offer.",
    };
  }
  if (mode === "meetings_required") {
    return {
      close_mode: mode,
      steps: ["Offer timeslots", "Confirm attendee list", "Prepare agenda"],
      notes: "Meetings required before close.",
    };
  }
  return {
    close_mode: mode,
    steps: ["Offer timeslots", "Allow async close path", "Provide fallback info"],
    notes: "Meetings optional; never forced.",
  };
};

import type { ThrottleResult } from "./throttle";
import type { LeadConsentState } from "./consent";

export type OnboardingStep = {
  step_id: string;
  description: string;
  proof_required: boolean;
};

export type OnboardingChecklist = {
  service_id: string;
  steps: OnboardingStep[];
};

export type RetentionCadence = {
  cadence_id: string;
  steps: string[];
};

export type UpsellGateInput = {
  consent: LeadConsentState;
  value_score: number;
  throttle: ThrottleResult;
  active_tasks: number;
};

export type UpsellGateResult = {
  allowed: boolean;
  reason?: string;
};

export const buildOnboardingChecklist = (serviceId: string): OnboardingChecklist => ({
  service_id: serviceId,
  steps: [
    { step_id: "welcome", description: "Welcome packet delivered", proof_required: true },
    { step_id: "requirements", description: "Requirements collected", proof_required: true },
    { step_id: "handoff", description: "Handoff summary complete", proof_required: false },
  ],
});

export const buildRetentionCadence = (): RetentionCadence => ({
  cadence_id: "default-retention",
  steps: ["30-day health check", "60-day feedback request", "90-day renewal reminder"],
});

export const shouldOfferUpsell = (input: UpsellGateInput): UpsellGateResult => {
  if (input.active_tasks > 5) {
    return { allowed: false, reason: "OVERWORK_RISK" };
  }
  if (!input.consent || input.consent.do_not_contact || input.consent.consent_status !== "granted") {
    return { allowed: false, reason: "CONSENT_REQUIRED" };
  }
  if (!input.throttle.allowed) {
    return { allowed: false, reason: "THROTTLE_BLOCKED" };
  }
  if (input.value_score < 60) {
    return { allowed: false, reason: "VALUE_THRESHOLD_NOT_MET" };
  }
  return { allowed: true };
};

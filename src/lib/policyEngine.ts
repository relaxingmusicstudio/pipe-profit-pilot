import { CIV_CONSTITUTION } from "./policy/constitution";
import type { ActionSpec } from "../types/actions";

export type PolicyMode = "OFFLINE" | "MOCK" | "LIVE";

export type PolicyContext = {
  mode: PolicyMode;
  trustLevel: number;
};

export type PolicyDecision = {
  allowed: boolean;
  reason?: string;
  requiresConfirm: boolean;
  cooldownSeconds: number;
};

const requiresPayloadTo = (actionType: ActionSpec["action_type"]) =>
  actionType === "message" || actionType === "email" || actionType === "webhook" || actionType === "sms" || actionType === "voice";

const hasPayloadTo = (payload: Record<string, unknown>): boolean => {
  const value = payload?.to;
  return typeof value === "string" && value.trim().length > 0;
};

export const evaluateAction = (action: ActionSpec, ctx: PolicyContext): PolicyDecision => {
  let allowed = true;
  let reason: string | undefined;
  const requiresConfirm = action.risk_level === "high" || action.irreversible;
  const cooldownSeconds = requiresConfirm ? 30 : 0;

  const hasIntent = typeof action.intent_id === "string" && action.intent_id.trim().length > 0;
  if (!hasIntent && ctx.mode !== "MOCK") {
    allowed = false;
    reason = "MISSING_INTENT";
  }

  if (
    ctx.mode === "OFFLINE" &&
    (action.action_type === "email" ||
      action.action_type === "webhook" ||
      action.action_type === "sms" ||
      action.action_type === "voice")
  ) {
    allowed = false;
    reason = "OFFLINE_BLOCKED";
  }

  if (ctx.mode === "LIVE" && requiresPayloadTo(action.action_type) && !hasPayloadTo(action.payload)) {
    allowed = false;
    reason = "MISSING_PAYLOAD_TO";
  }

  if (allowed && action.description) {
    const lowerDesc = action.description.toLowerCase();
    const forbiddenMatch = CIV_CONSTITUTION.nonGoals.find((goal) => lowerDesc.includes(goal.toLowerCase()));
    if (forbiddenMatch) {
      allowed = false;
      reason = "FORBIDDEN_OPTIMIZATION";
    }
  }

  return {
    allowed,
    reason,
    requiresConfirm,
    cooldownSeconds,
  };
};

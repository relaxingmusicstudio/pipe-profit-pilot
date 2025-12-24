import type { ExecutionRecord, ActionSpec } from "../types/actions";
import type { PolicyContext } from "./policyEngine";
import { stableStringify } from "../types/actions";

type RunResult = {
  status: "executed" | "failed";
  evidence: ExecutionRecord["evidence"];
  error?: string;
};

const buildMockEvidence = (action: ActionSpec): string => {
  const summary = stableStringify({
    action_id: action.action_id,
    action_type: action.action_type,
    intent_id: action.intent_id,
  });
  return `MOCK_EXEC:${summary}`;
};

export const runAction = async (action: ActionSpec, ctx: PolicyContext): Promise<RunResult> => {
  if (ctx.mode === "MOCK" || ctx.mode === "OFFLINE") {
    return {
      status: "executed",
      evidence: { kind: "mock", value: buildMockEvidence(action) },
    };
  }

  return {
    status: "failed",
    evidence: { kind: "log", value: `LIVE_EXEC_NOT_IMPLEMENTED:${action.action_type}` },
    error: "LIVE_EXEC_NOT_IMPLEMENTED",
  };
};

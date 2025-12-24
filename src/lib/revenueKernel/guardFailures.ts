import { deferred, halted, type DecisionOutcome } from "../decisionOutcome";

export type GuardFailureCode =
  | "FAIL_SAFE_OVERLOAD"
  | "FAIL_POLICY_CONFLICT"
  | "FAIL_COOLDOWN_ACTIVE"
  | "FAIL_CAPACITY_EXCEEDED";

export type GuardFailureAction = "wait" | "review" | "human_decision";

type GuardFailureInput = {
  code: GuardFailureCode;
  cause: string;
  action: GuardFailureAction;
  defer?: boolean;
  details?: Record<string, unknown>;
};

const nextActionFor = (action: GuardFailureAction): DecisionOutcome["nextAction"] => {
  switch (action) {
    case "wait":
      return { kind: "SCHEDULE" };
    case "review":
      return { kind: "ASK_USER" };
    case "human_decision":
      return { kind: "REQUEST_APPROVAL" };
    default:
      return { kind: "ASK_USER" };
  }
};

export const buildGuardOutcome = (input: GuardFailureInput): DecisionOutcome => {
  const cause = input.cause.trim().length > 0 ? input.cause.trim() : "Guard triggered";
  const summary = `${input.code}: ${cause}`;
  const details: Record<string, unknown> = {
    failure_code: input.code,
    cause,
    suggested_next_action: input.action,
    ...input.details,
  };
  const nextAction = nextActionFor(input.action);
  if (input.defer) {
    return deferred(summary, details, nextAction);
  }
  return halted(summary, details, nextAction);
};

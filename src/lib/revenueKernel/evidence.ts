import { hashString, stableStringify, type ActionSpec } from "../../types/actions";
import type { PolicyMode } from "../policyEngine";

export type EvidenceStatus = "mock" | "ok" | "error" | "safe_hold";

export type EvidenceRef = {
  provider: string;
  mode: PolicyMode;
  request_hash: string;
  response_id?: string;
  status: EvidenceStatus;
  timestamp: string;
};

export type EvidenceInput = {
  action: ActionSpec;
  provider: string;
  mode: PolicyMode;
  timestamp: string;
  response_id?: string;
  status?: EvidenceStatus;
};

export const buildEvidenceRef = (input: EvidenceInput): EvidenceRef => {
  const request_hash = hashString(
    stableStringify({
      action_id: input.action.action_id,
      action_type: input.action.action_type,
      payload: input.action.payload,
    })
  );
  const status =
    input.status ||
    (input.mode === "MOCK" ? "mock" : input.response_id ? "ok" : "safe_hold");

  const ref: EvidenceRef = {
    provider: input.provider,
    mode: input.mode,
    request_hash,
    status,
    timestamp: input.timestamp,
  };

  if (input.response_id) {
    ref.response_id = input.response_id;
  }

  return ref;
};

export const validateEvidenceRef = (ref: EvidenceRef): { ok: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  if (!ref.provider) reasons.push("provider");
  if (!ref.mode) reasons.push("mode");
  if (!ref.request_hash) reasons.push("request_hash");
  if (!ref.status) reasons.push("status");
  if (!ref.timestamp) reasons.push("timestamp");
  return { ok: reasons.length === 0, reasons };
};

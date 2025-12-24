import type { EvidenceRef } from "./evidence";

export type ConsentStatus = "unknown" | "granted" | "denied";

export type LeadConsentState = {
  consent_status: ConsentStatus;
  consent_evidence_ref?: EvidenceRef;
  do_not_contact: boolean;
  opt_out_evidence_ref?: EvidenceRef;
};

export type ConsentEvent = {
  event_id: string;
  lead_id: string;
  status: ConsentStatus;
  evidence_ref?: EvidenceRef;
  timestamp: string;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const CONSENT_PREFIX = "ppp:consentLedger:v1::";

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

export const recordConsentEvent = (identity: string, event: ConsentEvent, storage?: StorageLike): ConsentEvent => {
  const resolved = resolveStorage(storage);
  if (!resolved) return event;
  try {
    const key = `${CONSENT_PREFIX}${identity}`;
    const raw = resolved.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as ConsentEvent[]) : [];
    const next = Array.isArray(parsed) ? [...parsed, event] : [event];
    resolved.setItem(key, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return event;
};

export const canOutreach = (state: LeadConsentState): boolean =>
  state.consent_status === "granted" && !state.do_not_contact;

export const applyConsent = (
  leadId: string,
  state: LeadConsentState,
  status: ConsentStatus,
  evidence_ref: EvidenceRef,
  timestamp: string
): { next: LeadConsentState; event: ConsentEvent } => {
  const next: LeadConsentState = {
    ...state,
    consent_status: status,
    consent_evidence_ref: evidence_ref,
  };

  const event: ConsentEvent = {
    event_id: `consent-${leadId}-${timestamp}`,
    lead_id: leadId,
    status,
    evidence_ref,
    timestamp,
  };

  return { next, event };
};

export const applyOptOut = (
  leadId: string,
  state: LeadConsentState,
  evidence_ref: EvidenceRef,
  timestamp: string
): { next: LeadConsentState; event: ConsentEvent; blocked: boolean; reason?: string } => {
  if (state.do_not_contact) {
    return {
      next: state,
      event: {
        event_id: `consent-${leadId}-${timestamp}`,
        lead_id: leadId,
        status: state.consent_status,
        evidence_ref,
        timestamp,
      },
      blocked: true,
      reason: "OPT_OUT_ALREADY_SET",
    };
  }

  const next: LeadConsentState = {
    ...state,
    do_not_contact: true,
    opt_out_evidence_ref: evidence_ref,
  };

  const event: ConsentEvent = {
    event_id: `consent-${leadId}-${timestamp}`,
    lead_id: leadId,
    status: "denied",
    evidence_ref,
    timestamp,
  };

  return { next, event, blocked: false };
};

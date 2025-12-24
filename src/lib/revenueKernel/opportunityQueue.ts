import type { EvidenceRef } from "./evidence";

export type OpportunityQueueEventType = "enqueue" | "resolve" | "drop";

export type OpportunityQueueEvent = {
  event_id: string;
  pod_id: string;
  opportunity_id: string;
  timestamp: string;
  type: OpportunityQueueEventType;
  reason: string;
  evidence_ref: EvidenceRef;
};

export type OpportunityEntry = {
  opportunity_id: string;
  added_at: string;
};

export type OpportunityQueueConfig = {
  max_size: number;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_PREFIX = "ppp:opportunityQueue:v1::";
const CLOCK_PREFIX = "ppp:opportunityQueueClock:v1::";

const defaultConfig: OpportunityQueueConfig = {
  max_size: 5,
};

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const ledgerKey = (podId: string) => `${LEDGER_PREFIX}${podId}`;
const clockKey = (podId: string) => `${CLOCK_PREFIX}${podId}`;

export const nextOpportunityTimestamp = (podId: string, storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "o0";
  const raw = resolved.getItem(clockKey(podId));
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(clockKey(podId), String(nextValue));
  return `o${nextValue}`;
};

const readLedger = (podId: string, storage?: StorageLike): OpportunityQueueEvent[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(ledgerKey(podId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OpportunityQueueEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLedger = (podId: string, entries: OpportunityQueueEvent[], storage?: StorageLike) => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  try {
    resolved.setItem(ledgerKey(podId), JSON.stringify(entries));
  } catch {
    // ignore persistence failures
  }
};

export const appendOpportunityEvent = (
  podId: string,
  event: Omit<OpportunityQueueEvent, "event_id">,
  storage?: StorageLike
): OpportunityQueueEvent => {
  const stamped: OpportunityQueueEvent = {
    ...event,
    event_id: `opp-${podId}-${event.timestamp}-${event.type}`,
  };
  const existing = readLedger(podId, storage);
  writeLedger(podId, [...existing, stamped], storage);
  return stamped;
};

export const getOpportunityQueue = (
  podId: string,
  storage?: StorageLike
): { entries: OpportunityEntry[]; events: OpportunityQueueEvent[] } => {
  const events = readLedger(podId, storage);
  const entries: OpportunityEntry[] = [];

  for (const event of events) {
    if (event.type === "enqueue") {
      if (!entries.find((entry) => entry.opportunity_id === event.opportunity_id)) {
        entries.push({ opportunity_id: event.opportunity_id, added_at: event.timestamp });
      }
    } else if (event.type === "resolve" || event.type === "drop") {
      const index = entries.findIndex((entry) => entry.opportunity_id === event.opportunity_id);
      if (index >= 0) {
        entries.splice(index, 1);
      }
    }
  }

  return { entries, events };
};

export const getOpportunityQueueConfig = (config?: OpportunityQueueConfig): OpportunityQueueConfig => ({
  max_size: Number.isFinite(config?.max_size) ? Math.max(1, Number(config?.max_size)) : defaultConfig.max_size,
});

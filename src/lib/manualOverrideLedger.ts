import { ActionImpact } from "./irreversibilityMap";

export type ManualOverrideEvent = {
  override_id: string;
  timestamp: string;
  actor_id: string;
  reason: string;
  action_impact: ActionImpact;
  confirmation: "CONFIRMED";
  irreversible_warning: boolean;
  action_key?: string;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_PREFIX = "ppp:manualOverrideLedger:v1::";
const CLOCK_PREFIX = "ppp:manualOverrideClock:v1::";

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const ledgerKey = (identity: string) => `${LEDGER_PREFIX}${identity}`;
const clockKey = (identity: string) => `${CLOCK_PREFIX}${identity}`;

export const nextManualOverrideTimestamp = (identity: string, storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "m0";
  const raw = resolved.getItem(clockKey(identity));
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(clockKey(identity), String(nextValue));
  return `m${nextValue}`;
};

const readLedger = (identity: string, storage?: StorageLike): ManualOverrideEvent[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(ledgerKey(identity));
    const parsed = raw ? (JSON.parse(raw) as ManualOverrideEvent[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const loadManualOverrideHistory = (
  identity: string,
  limit = 10,
  storage?: StorageLike
): ManualOverrideEvent[] => {
  const events = readLedger(identity, storage);
  if (!Array.isArray(events)) return [];
  return events.slice(-limit).reverse();
};

export const appendManualOverrideEvent = (
  identity: string,
  event: Omit<ManualOverrideEvent, "override_id" | "timestamp" | "irreversible_warning"> & { timestamp?: string },
  storage?: StorageLike
): ManualOverrideEvent => {
  const timestamp = event.timestamp || nextManualOverrideTimestamp(identity, storage);
  const irreversible_warning = event.action_impact === ActionImpact.IRREVERSIBLE;
  const stamped: ManualOverrideEvent = {
    ...event,
    timestamp,
    irreversible_warning,
    override_id: `override-${identity}-${timestamp}`,
  };
  const resolved = resolveStorage(storage);
  if (!resolved) return stamped;
  try {
    const existing = readLedger(identity, storage);
    resolved.setItem(ledgerKey(identity), JSON.stringify([...existing, stamped]));
  } catch {
    // ignore persistence errors
  }
  return stamped;
};

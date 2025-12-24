export type SoftLockEventType = "acquire" | "release";

export type SoftLockEvent = {
  event_id: string;
  resource_id: string;
  pod_id: string;
  timestamp: string;
  type: SoftLockEventType;
  reason: string;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_KEY = "ppp:softLocks:v1";
const CLOCK_KEY = "ppp:softLocksClock:v1";

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

export const nextSoftLockTimestamp = (storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "l0";
  const raw = resolved.getItem(CLOCK_KEY);
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(CLOCK_KEY, String(nextValue));
  return `l${nextValue}`;
};

const readLedger = (storage?: StorageLike): SoftLockEvent[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(LEDGER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SoftLockEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLedger = (entries: SoftLockEvent[], storage?: StorageLike) => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  try {
    resolved.setItem(LEDGER_KEY, JSON.stringify(entries));
  } catch {
    // ignore persistence failures
  }
};

export const appendSoftLockEvent = (
  resourceId: string,
  podId: string,
  type: SoftLockEventType,
  reason: string,
  storage?: StorageLike
): SoftLockEvent => {
  const timestamp = nextSoftLockTimestamp(storage);
  const event: SoftLockEvent = {
    event_id: `lock-${resourceId}-${timestamp}-${type}`,
    resource_id: resourceId,
    pod_id: podId,
    timestamp,
    type,
    reason,
  };
  const existing = readLedger(storage);
  writeLedger([...existing, event], storage);
  return event;
};

export const getSoftLockState = (
  resourceId: string,
  storage?: StorageLike
): { holder?: string; lastEvent?: SoftLockEvent } => {
  const events = readLedger(storage).filter((event) => event.resource_id === resourceId);
  if (events.length === 0) return {};
  const lastEvent = events[events.length - 1];
  if (lastEvent.type === "acquire") {
    return { holder: lastEvent.pod_id, lastEvent };
  }
  return { holder: undefined, lastEvent };
};

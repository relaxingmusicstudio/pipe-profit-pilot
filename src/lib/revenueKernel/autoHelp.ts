export type AutoHelpEventType = "auto_help" | "ack";

export type AutoHelpEvent = {
  event_id: string;
  thread_id: string;
  timestamp: string;
  type: AutoHelpEventType;
  reason: string;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_PREFIX = "ppp:autoHelp:v1::";
const CLOCK_PREFIX = "ppp:autoHelpClock:v1::";

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const ledgerKey = (threadId: string) => `${LEDGER_PREFIX}${threadId}`;
const clockKey = (threadId: string) => `${CLOCK_PREFIX}${threadId}`;

export const nextAutoHelpTimestamp = (threadId: string, storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "h0";
  const raw = resolved.getItem(clockKey(threadId));
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(clockKey(threadId), String(nextValue));
  return `h${nextValue}`;
};

const readLedger = (threadId: string, storage?: StorageLike): AutoHelpEvent[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(ledgerKey(threadId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AutoHelpEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLedger = (threadId: string, entries: AutoHelpEvent[], storage?: StorageLike) => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  try {
    resolved.setItem(ledgerKey(threadId), JSON.stringify(entries));
  } catch {
    // ignore persistence failures
  }
};

export const appendAutoHelpEvent = (
  threadId: string,
  type: AutoHelpEventType,
  reason: string,
  storage?: StorageLike
): AutoHelpEvent => {
  const timestamp = nextAutoHelpTimestamp(threadId, storage);
  const event: AutoHelpEvent = {
    event_id: `auto-${threadId}-${timestamp}-${type}`,
    thread_id: threadId,
    timestamp,
    type,
    reason,
  };
  const existing = readLedger(threadId, storage);
  writeLedger(threadId, [...existing, event], storage);
  return event;
};

export const hasUnackedAutoHelp = (threadId: string, storage?: StorageLike): boolean => {
  const events = readLedger(threadId, storage);
  let unacked = false;
  for (const event of events) {
    if (event.type === "auto_help") unacked = true;
    if (event.type === "ack") unacked = false;
  }
  return unacked;
};

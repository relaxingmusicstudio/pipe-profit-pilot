export type ActionChainEventType = "reset" | "attempt" | "blocked" | "complete";

export type ActionChainEvent = {
  event_id: string;
  thread_id: string;
  timestamp: string;
  type: ActionChainEventType;
  action_id: string;
  reason: string;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_PREFIX = "ppp:actionChain:v1::";
const CLOCK_PREFIX = "ppp:actionChainClock:v1::";

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const ledgerKey = (threadId: string) => `${LEDGER_PREFIX}${threadId}`;
const clockKey = (threadId: string) => `${CLOCK_PREFIX}${threadId}`;

export const nextActionChainTimestamp = (threadId: string, storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "c0";
  const raw = resolved.getItem(clockKey(threadId));
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(clockKey(threadId), String(nextValue));
  return `c${nextValue}`;
};

const readLedger = (threadId: string, storage?: StorageLike): ActionChainEvent[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(ledgerKey(threadId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActionChainEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLedger = (threadId: string, entries: ActionChainEvent[], storage?: StorageLike) => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  try {
    resolved.setItem(ledgerKey(threadId), JSON.stringify(entries));
  } catch {
    // ignore persistence failures
  }
};

export const appendActionChainEvent = (
  threadId: string,
  event: Omit<ActionChainEvent, "event_id">,
  storage?: StorageLike
): ActionChainEvent => {
  const stamped: ActionChainEvent = {
    ...event,
    event_id: `chain-${threadId}-${event.timestamp}-${event.type}`,
  };
  const existing = readLedger(threadId, storage);
  writeLedger(threadId, [...existing, stamped], storage);
  return stamped;
};

export const getActionChainDepth = (
  threadId: string,
  storage?: StorageLike
): { depth: number; lastResetAt?: string } => {
  const events = readLedger(threadId, storage);
  let lastResetIndex = -1;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === "reset") {
      lastResetIndex = i;
      break;
    }
  }
  const slice = lastResetIndex >= 0 ? events.slice(lastResetIndex + 1) : events;
  const depth = slice.filter((event) => event.type === "attempt").length;
  return {
    depth,
    lastResetAt: lastResetIndex >= 0 ? events[lastResetIndex].timestamp : undefined,
  };
};

export const checkActionChainDepth = (
  threadId: string,
  maxDepth: number,
  storage?: StorageLike
): { ok: boolean; depth: number; maxDepth: number } => {
  const { depth } = getActionChainDepth(threadId, storage);
  return { ok: depth < maxDepth, depth, maxDepth };
};

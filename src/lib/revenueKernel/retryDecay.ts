export type RetryOutcome = "executed" | "deferred" | "halted";

export type RetryEvent = {
  event_id: string;
  retry_key: string;
  timestamp: string;
  outcome: RetryOutcome;
  reason: string;
};

export type RetryState = {
  attempts: number;
  failures: number;
  required_cooldown_steps: number;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_KEY = "ppp:retryDecay:v1";
const CLOCK_KEY = "ppp:retryDecayClock:v1";

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

export const nextRetryTimestamp = (storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "r0";
  const raw = resolved.getItem(CLOCK_KEY);
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(CLOCK_KEY, String(nextValue));
  return `r${nextValue}`;
};

const readLedger = (storage?: StorageLike): RetryEvent[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(LEDGER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RetryEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLedger = (entries: RetryEvent[], storage?: StorageLike) => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  try {
    resolved.setItem(LEDGER_KEY, JSON.stringify(entries));
  } catch {
    // ignore persistence failures
  }
};

export const appendRetryEvent = (
  retryKey: string,
  outcome: RetryOutcome,
  reason: string,
  storage?: StorageLike
): RetryEvent => {
  const timestamp = nextRetryTimestamp(storage);
  const event: RetryEvent = {
    event_id: `retry-${retryKey}-${timestamp}`,
    retry_key: retryKey,
    timestamp,
    outcome,
    reason,
  };
  const existing = readLedger(storage);
  writeLedger([...existing, event], storage);
  return event;
};

export const getRetryState = (
  retryKey: string,
  baseCooldownSteps: number,
  storage?: StorageLike
): RetryState => {
  const events = readLedger(storage).filter((event) => event.retry_key === retryKey);
  const attempts = events.length;
  const failures = events.filter((event) => event.outcome !== "executed").length;
  const required_cooldown_steps = failures > 0 ? baseCooldownSteps + failures : 0;
  return { attempts, failures, required_cooldown_steps };
};

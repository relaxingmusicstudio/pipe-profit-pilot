import type { ActionSpec } from "../../types/actions";
import type { DecisionOutcome } from "../decisionOutcome";
import type { EvidenceRef } from "./evidence";
import type { StageTransition } from "./stages";

export type RevenueLedgerEntry = {
  entry_id: string;
  timestamp: string;
  identity: string;
  action: ActionSpec;
  outcome: DecisionOutcome;
  evidence_ref: EvidenceRef;
  stage_transition?: StageTransition;
  notes?: string;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_PREFIX = "ppp:revenueLedger:v1::";
const CLOCK_PREFIX = "ppp:revenueLedgerClock:v1::";

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const ledgerKey = (identity: string) => `${LEDGER_PREFIX}${identity}`;
const clockKey = (identity: string) => `${CLOCK_PREFIX}${identity}`;

export const nextRevenueTimestamp = (identity: string, storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "s0";
  const raw = resolved.getItem(clockKey(identity));
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(clockKey(identity), String(nextValue));
  return `s${nextValue}`;
};

export const appendRevenueLedger = (
  identity: string,
  entry: Omit<RevenueLedgerEntry, "entry_id">,
  storage?: StorageLike
): RevenueLedgerEntry => {
  const resolved = resolveStorage(storage);
  const stamped: RevenueLedgerEntry = {
    ...entry,
    entry_id: `rev-${identity}-${entry.timestamp}`,
  };
  if (!resolved) return stamped;
  try {
    const raw = resolved.getItem(ledgerKey(identity));
    const parsed = raw ? (JSON.parse(raw) as RevenueLedgerEntry[]) : [];
    const next = Array.isArray(parsed) ? [...parsed, stamped] : [stamped];
    resolved.setItem(ledgerKey(identity), JSON.stringify(next));
  } catch {
    // ignore persistence failures
  }
  return stamped;
};

export const loadRevenueLedgerPage = (
  identity: string,
  limit: number,
  cursor?: string | null,
  storage?: StorageLike
): { entries: RevenueLedgerEntry[]; nextCursor: string | null } => {
  const resolved = resolveStorage(storage);
  if (!resolved) return { entries: [], nextCursor: null };
  try {
    const raw = resolved.getItem(ledgerKey(identity));
    const parsed = raw ? (JSON.parse(raw) as RevenueLedgerEntry[]) : [];
    const entries = Array.isArray(parsed) ? parsed : [];
    const startIndex = cursor ? entries.findIndex((entry) => entry.entry_id === cursor) + 1 : 0;
    const page = entries.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < entries.length ? page[page.length - 1]?.entry_id ?? null : null;
    return { entries: page, nextCursor };
  } catch {
    return { entries: [], nextCursor: null };
  }
};

export const loadRevenueLedgerTail = (
  identity: string,
  limit: number,
  cursor?: string | null,
  storage?: StorageLike
): { entries: RevenueLedgerEntry[]; nextCursor: string | null } => {
  const resolved = resolveStorage(storage);
  if (!resolved) return { entries: [], nextCursor: null };
  try {
    const raw = resolved.getItem(ledgerKey(identity));
    const parsed = raw ? (JSON.parse(raw) as RevenueLedgerEntry[]) : [];
    const entries = Array.isArray(parsed) ? parsed : [];
    if (entries.length === 0) return { entries: [], nextCursor: null };

    const endIndex = cursor ? entries.findIndex((entry) => entry.entry_id === cursor) : entries.length;
    const safeEnd = endIndex > 0 ? endIndex : entries.length;
    const startIndex = Math.max(0, safeEnd - limit);
    const page = entries.slice(startIndex, safeEnd);
    const nextCursor = startIndex > 0 ? entries[startIndex - 1]?.entry_id ?? null : null;
    return { entries: page, nextCursor };
  } catch {
    return { entries: [], nextCursor: null };
  }
};

import type { ActionSpec, ExecutionRecord } from "../types/actions";
import { computeIdentityKey } from "./spine";
import { evaluateAction, type PolicyContext, type PolicyMode } from "./policyEngine";
import { runAction } from "./actionRunner";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

type ExecuteActionOptions = {
  requireUserConfirm?: boolean;
  identityKey?: string;
  policyContext?: PolicyContext;
};

const LEDGER_PREFIX = "ppp:execLedger:v1::";
const CLOCK_PREFIX = "ppp:execLedgerClock:v1::";

const createMemoryStorage = (): StorageLike => {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
};

const memoryStorage = createMemoryStorage();

const getStorage = (): StorageLike => {
  const globalStorage = (globalThis as { localStorage?: StorageLike }).localStorage;
  if (globalStorage) return globalStorage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return memoryStorage;
};

const readFlag = (storage: StorageLike, key: string): boolean => {
  try {
    return storage.getItem(key) === "true";
  } catch {
    return false;
  }
};

const resolveMode = (storage: StorageLike): PolicyMode => {
  const envMock = import.meta.env?.VITE_MOCK_AUTH === "true";
  if (envMock || readFlag(storage, "VITE_MOCK_AUTH")) return "MOCK";
  if (readFlag(storage, "__DEV_OFFLINE")) return "OFFLINE";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "OFFLINE";
  if (typeof window === "undefined") return "OFFLINE";
  return "LIVE";
};

const resolveTrustLevel = (mode: PolicyMode): number => {
  if (mode === "MOCK") return 1;
  return 0;
};

const readLedger = (storage: StorageLike, identityKey: string): ExecutionRecord[] => {
  const raw = storage.getItem(`${LEDGER_PREFIX}${identityKey}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ExecutionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLedger = (storage: StorageLike, identityKey: string, entries: ExecutionRecord[]) => {
  try {
    storage.setItem(`${LEDGER_PREFIX}${identityKey}`, JSON.stringify(entries));
  } catch {
    // ignore persistence errors
  }
};

const nextClock = (storage: StorageLike, identityKey: string): string => {
  const key = `${CLOCK_PREFIX}${identityKey}`;
  const raw = storage.getItem(key);
  const current = raw ? Number.parseInt(raw, 10) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  storage.setItem(key, String(next));
  return `s${next}`;
};

const buildRecord = (
  base: Pick<ExecutionRecord, "action_id" | "intent_id">,
  status: ExecutionRecord["status"],
  evidence: ExecutionRecord["evidence"],
  timestamp: string
): ExecutionRecord => ({
  execution_id: `exec-${timestamp}`,
  action_id: base.action_id,
  intent_id: base.intent_id,
  status,
  evidence,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const executeActionPipeline = async (
  action: ActionSpec,
  opts: ExecuteActionOptions = {}
): Promise<ExecutionRecord> => {
  const storage = getStorage();
  const mode = opts.policyContext?.mode ?? resolveMode(storage);
  const trustLevel = opts.policyContext?.trustLevel ?? resolveTrustLevel(mode);
  const ctx: PolicyContext = { mode, trustLevel };
  const identityKey = opts.identityKey || computeIdentityKey(undefined, undefined);
  const safeIntentId =
    action.intent_id && action.intent_id.trim().length > 0
      ? action.intent_id
      : mode === "MOCK"
        ? "intent:default"
        : "intent:missing";
  const timestamp = nextClock(storage, identityKey);
  const policy = evaluateAction({ ...action, intent_id: safeIntentId }, ctx);

  if (!policy.allowed) {
    const blocked = buildRecord(
      { action_id: action.action_id, intent_id: safeIntentId },
      "blocked",
      { kind: "log", value: policy.reason ?? "POLICY_BLOCKED" },
      timestamp
    );
    const nextEntries = [...readLedger(storage, identityKey), blocked];
    writeLedger(storage, identityKey, nextEntries);
    return blocked;
  }

  if (policy.requiresConfirm && !opts.requireUserConfirm) {
    const cooldown = buildRecord(
      { action_id: action.action_id, intent_id: safeIntentId },
      "cooldown",
      { kind: "log", value: `CONFIRM_REQUIRED:${policy.cooldownSeconds}s` },
      timestamp
    );
    const nextEntries = [...readLedger(storage, identityKey), cooldown];
    writeLedger(storage, identityKey, nextEntries);
    return cooldown;
  }

  const result = await runAction({ ...action, intent_id: safeIntentId }, ctx);
  const status: ExecutionRecord["status"] = result.status === "executed" ? "executed" : "failed";
  const executed = buildRecord({ action_id: action.action_id, intent_id: safeIntentId }, status, result.evidence, timestamp);
  const nextEntries = [...readLedger(storage, identityKey), executed];
  writeLedger(storage, identityKey, nextEntries);
  return executed;
};

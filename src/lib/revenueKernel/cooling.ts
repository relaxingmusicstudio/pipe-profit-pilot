import type { EvidenceRef } from "./evidence";
import type { CoolingState } from "./capacityLedger";

export type CoolingEventType =
  | "window_init"
  | "opportunity_added"
  | "deferral"
  | "pause"
  | "resume"
  | "burnout_signal"
  | "cooling_enter"
  | "cooling_exit"
  | "repair_enter"
  | "repair_exit";

export type CoolingEvent = {
  event_id: string;
  pod_id: string;
  window_id: string;
  timestamp: string;
  type: CoolingEventType;
  reason: string;
  evidence_ref: EvidenceRef;
};

export type CoolingWindowState = {
  window_id: string;
  max_new: number;
  new_count: number;
  deferral_count: number;
  burnout_signals: number;
  paused: boolean;
  cooling_state: CoolingState;
};

export type CoolingConfig = {
  max_new: number;
  deferral_threshold: number;
  repair_threshold: number;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_PREFIX = "ppp:coolingLedger:v1::";
const CLOCK_PREFIX = "ppp:coolingClock:v1::";

const defaultConfig: CoolingConfig = {
  max_new: 5,
  deferral_threshold: 3,
  repair_threshold: 6,
};

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const ledgerKey = (podId: string) => `${LEDGER_PREFIX}${podId}`;
const clockKey = (podId: string) => `${CLOCK_PREFIX}${podId}`;

export const nextCoolingTimestamp = (podId: string, storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "s0";
  const raw = resolved.getItem(clockKey(podId));
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(clockKey(podId), String(nextValue));
  return `s${nextValue}`;
};

const readLedger = (podId: string, storage?: StorageLike): CoolingEvent[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(ledgerKey(podId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CoolingEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLedger = (podId: string, entries: CoolingEvent[], storage?: StorageLike) => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  try {
    resolved.setItem(ledgerKey(podId), JSON.stringify(entries));
  } catch {
    // ignore persistence errors
  }
};

export const appendCoolingEvent = (
  podId: string,
  event: Omit<CoolingEvent, "event_id">,
  storage?: StorageLike
): CoolingEvent => {
  const stamped: CoolingEvent = {
    ...event,
    event_id: `cool-${podId}-${event.window_id}-${event.timestamp}-${event.type}`,
  };
  const existing = readLedger(podId, storage);
  const next = [...existing, stamped];
  writeLedger(podId, next, storage);
  return stamped;
};

export const getCoolingState = (
  podId: string,
  windowId: string,
  config: CoolingConfig = defaultConfig,
  storage?: StorageLike
): { state: CoolingWindowState; events: CoolingEvent[] } => {
  const events = readLedger(podId, storage).filter((event) => event.window_id === windowId);
  const base: CoolingWindowState = {
    window_id: windowId,
    max_new: config.max_new,
    new_count: 0,
    deferral_count: 0,
    burnout_signals: 0,
    paused: false,
    cooling_state: "normal",
  };

  const state = events.reduce<CoolingWindowState>((acc, event) => {
    switch (event.type) {
      case "window_init":
        return {
          ...acc,
          max_new: config.max_new,
          new_count: 0,
          deferral_count: 0,
          burnout_signals: 0,
          paused: false,
          cooling_state: "normal",
        };
      case "opportunity_added":
        return { ...acc, new_count: acc.new_count + 1 };
      case "deferral":
        return { ...acc, deferral_count: acc.deferral_count + 1 };
      case "pause":
        return { ...acc, paused: true, cooling_state: "cooling" };
      case "resume":
        return { ...acc, paused: false, cooling_state: "normal" };
      case "burnout_signal":
        return { ...acc, burnout_signals: acc.burnout_signals + 1 };
      case "cooling_enter":
        return { ...acc, cooling_state: "cooling" };
      case "cooling_exit":
        return { ...acc, cooling_state: "normal", deferral_count: 0, burnout_signals: 0, paused: false };
      case "repair_enter":
        return { ...acc, cooling_state: "repair" };
      case "repair_exit":
        return { ...acc, cooling_state: "normal", deferral_count: 0, burnout_signals: 0, paused: false };
      default:
        return acc;
    }
  }, base);

  return { state, events };
};

export const evaluateCoolingState = (
  state: CoolingWindowState,
  config: CoolingConfig = defaultConfig
): { nextState: CoolingState; reason?: string } => {
  if (state.cooling_state === "repair") return { nextState: "repair", reason: "REPAIR_ACTIVE" };
  if (state.paused) return { nextState: "cooling", reason: "MANUAL_PAUSE" };
  if (state.burnout_signals > 0) return { nextState: "cooling", reason: "BURNOUT_SIGNAL" };
  if (state.deferral_count >= config.repair_threshold) return { nextState: "repair", reason: "DEFERRAL_SATURATION" };
  if (state.deferral_count >= config.deferral_threshold) return { nextState: "cooling", reason: "DEFERRAL_THRESHOLD" };
  if (state.new_count >= config.max_new) return { nextState: "cooling", reason: "OPPORTUNITY_CAP" };
  return { nextState: "normal" };
};

export const canExitRepair = (state: CoolingWindowState, activeLoad: number): boolean =>
  state.cooling_state === "repair" && activeLoad <= 0;

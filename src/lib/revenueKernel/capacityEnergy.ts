import type { EvidenceRef } from "./evidence";

export type EnergyChannel = "sms" | "voice" | "email" | "webhook" | "task" | "internal" | "unknown";

export type CapacityEnergyEvent = {
  event_id: string;
  pod_id: string;
  human_id: string;
  channel: EnergyChannel;
  day_id: string;
  units: number;
  timestamp: string;
  reason: string;
  evidence_ref: EvidenceRef;
};

export type CapacityEnergyConfig = {
  perPod: number;
  perHuman: number;
  perChannel: number;
  perDay: number;
  minUnits: number;
};

export type CapacityEnergyState = {
  pod_used: number;
  human_used: number;
  channel_used: number;
  day_used: number;
  limits: CapacityEnergyConfig;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_KEY = "ppp:capacityEnergy:v1";
const CLOCK_KEY = "ppp:capacityEnergyClock:v1";

const defaultConfig: CapacityEnergyConfig = {
  perPod: 5,
  perHuman: 4,
  perChannel: 4,
  perDay: 10,
  minUnits: 1,
};

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

export const nextCapacityEnergyTimestamp = (storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "e0";
  const raw = resolved.getItem(CLOCK_KEY);
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(CLOCK_KEY, String(nextValue));
  return `e${nextValue}`;
};

const readLedger = (storage?: StorageLike): CapacityEnergyEvent[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(LEDGER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CapacityEnergyEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLedger = (entries: CapacityEnergyEvent[], storage?: StorageLike) => {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  try {
    resolved.setItem(LEDGER_KEY, JSON.stringify(entries));
  } catch {
    // ignore persistence errors
  }
};

export const appendCapacityEnergyEvent = (
  event: Omit<CapacityEnergyEvent, "event_id" | "timestamp"> & { timestamp?: string },
  storage?: StorageLike
): CapacityEnergyEvent => {
  const timestamp = event.timestamp || nextCapacityEnergyTimestamp(storage);
  const stamped: CapacityEnergyEvent = {
    ...event,
    timestamp,
    event_id: `energy-${event.pod_id}-${timestamp}`,
  };
  const existing = readLedger(storage);
  writeLedger([...existing, stamped], storage);
  return stamped;
};

export const getCapacityEnergyConfig = (config?: CapacityEnergyConfig): CapacityEnergyConfig => ({
  perPod: Number.isFinite(config?.perPod) ? Math.max(0, Number(config?.perPod)) : defaultConfig.perPod,
  perHuman: Number.isFinite(config?.perHuman) ? Math.max(0, Number(config?.perHuman)) : defaultConfig.perHuman,
  perChannel: Number.isFinite(config?.perChannel) ? Math.max(0, Number(config?.perChannel)) : defaultConfig.perChannel,
  perDay: Number.isFinite(config?.perDay) ? Math.max(0, Number(config?.perDay)) : defaultConfig.perDay,
  minUnits: Number.isFinite(config?.minUnits) ? Math.max(0, Number(config?.minUnits)) : defaultConfig.minUnits,
});

export const getCapacityEnergyState = (
  podId: string,
  humanId: string,
  channel: EnergyChannel,
  dayId: string,
  config?: CapacityEnergyConfig,
  storage?: StorageLike
): CapacityEnergyState => {
  const limits = getCapacityEnergyConfig(config);
  const events = readLedger(storage).filter((event) => event.day_id === dayId);
  const pod_used = events.filter((event) => event.pod_id === podId).reduce((sum, item) => sum + item.units, 0);
  const human_used = events.filter((event) => event.human_id === humanId).reduce((sum, item) => sum + item.units, 0);
  const channel_used = events.filter((event) => event.channel === channel).reduce((sum, item) => sum + item.units, 0);
  const day_used = events.reduce((sum, item) => sum + item.units, 0);
  return { pod_used, human_used, channel_used, day_used, limits };
};

export const checkCapacityEnergy = (
  state: CapacityEnergyState,
  requiredUnits: number
): { ok: boolean; reason?: string } => {
  if (requiredUnits <= 0) return { ok: true };
  if (state.pod_used + requiredUnits > state.limits.perPod) return { ok: false, reason: "POD_CAPACITY" };
  if (state.human_used + requiredUnits > state.limits.perHuman) return { ok: false, reason: "HUMAN_CAPACITY" };
  if (state.channel_used + requiredUnits > state.limits.perChannel) return { ok: false, reason: "CHANNEL_CAPACITY" };
  if (state.day_used + requiredUnits > state.limits.perDay) return { ok: false, reason: "DAY_CAPACITY" };
  return { ok: true };
};

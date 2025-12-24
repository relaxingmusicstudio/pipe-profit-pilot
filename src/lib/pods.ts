import { computeIdentityKey } from "./spine";

export type PodScope = "local" | "remote";

export type PodMember = {
  member_id: string;
  role: string;
  scope: PodScope;
};

export type PodStatus = "active" | "merged" | "split" | "dissolved";

export type PodAssetRetention = {
  knowledge: true;
  ledger: true;
  tools: true;
};

export const POD_ASSET_PRESERVATION: PodAssetRetention = Object.freeze({
  knowledge: true,
  ledger: true,
  tools: true,
});

export type PodProfile = {
  pod_id: string;
  name: string;
  revenue_share: number;
  members: PodMember[];
  status: PodStatus;
  created_at: string;
  updated_at: string;
};

export type PodEventType =
  | "create"
  | "merge"
  | "split"
  | "dissolve"
  | "revenue_share_update"
  | "member_add"
  | "member_remove";

export type PodEvent = {
  event_id: string;
  timestamp: string;
  type: PodEventType;
  pod_id: string;
  actor_id: string;
  reason: string;
  target_pod_ids?: string[];
  revenue_share?: number;
  members?: PodMember[];
  preserve_assets?: PodAssetRetention;
};

export type PodStateSnapshot = {
  pods: PodProfile[];
  lastEvent: PodEvent | null;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const LEDGER_PREFIX = "ppp:podLedger:v1::";
const CLOCK_PREFIX = "ppp:podClock:v1::";

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

const ledgerKey = (identity: string) => `${LEDGER_PREFIX}${identity}`;
const clockKey = (identity: string) => `${CLOCK_PREFIX}${identity}`;

export const nextPodTimestamp = (identity: string, storage?: StorageLike): string => {
  const resolved = resolveStorage(storage);
  if (!resolved) return "p0";
  const raw = resolved.getItem(clockKey(identity));
  const current = Number.parseInt(String(raw ?? ""), 10);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  resolved.setItem(clockKey(identity), String(nextValue));
  return `p${nextValue}`;
};

export const loadPodLedger = (identity: string, storage?: StorageLike): PodEvent[] => {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  try {
    const raw = resolved.getItem(ledgerKey(identity));
    const parsed = raw ? (JSON.parse(raw) as PodEvent[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const appendPodEvent = (
  identity: string,
  event: Omit<PodEvent, "event_id" | "timestamp"> & { timestamp?: string },
  storage?: StorageLike
): PodEvent => {
  const timestamp = event.timestamp || nextPodTimestamp(identity, storage);
  const preserve_assets =
    event.type === "dissolve" || event.type === "merge" || event.type === "split"
      ? event.preserve_assets || POD_ASSET_PRESERVATION
      : event.preserve_assets;
  const stamped: PodEvent = {
    ...event,
    timestamp,
    preserve_assets,
    event_id: `pod-${identity}-${timestamp}-${event.type}`,
  };
  const resolved = resolveStorage(storage);
  if (!resolved) return stamped;
  try {
    const existing = loadPodLedger(identity, storage);
    resolved.setItem(ledgerKey(identity), JSON.stringify([...existing, stamped]));
  } catch {
    // ignore persistence errors
  }
  return stamped;
};

const clampShare = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, Number(value)));
};

export const buildDefaultPod = (identity?: string | null): PodProfile => {
  const podId = identity ? computeIdentityKey(identity, null) : "primary-pod";
  return {
    pod_id: podId,
    name: "Primary Pod",
    revenue_share: 1,
    members: [],
    status: "active",
    created_at: "p0",
    updated_at: "p0",
  };
};

export const derivePodState = (
  identity: string,
  events: PodEvent[],
  seed?: PodProfile[]
): PodStateSnapshot => {
  const basePods = seed && seed.length > 0 ? seed : [buildDefaultPod(identity)];
  const pods = new Map<string, PodProfile>(basePods.map((pod) => [pod.pod_id, { ...pod }]));

  const applyEvent = (event: PodEvent) => {
    const current = pods.get(event.pod_id);
    switch (event.type) {
      case "create": {
        const next = current ?? {
          pod_id: event.pod_id,
          name: `Pod ${event.pod_id}`,
          revenue_share: clampShare(event.revenue_share),
          members: event.members ?? [],
          status: "active",
          created_at: event.timestamp,
          updated_at: event.timestamp,
        };
        pods.set(event.pod_id, { ...next, updated_at: event.timestamp, status: "active" });
        break;
      }
      case "merge": {
        if (current) {
          pods.set(event.pod_id, { ...current, status: "active", updated_at: event.timestamp });
        }
        for (const target of event.target_pod_ids ?? []) {
          const targetPod = pods.get(target);
          if (targetPod) {
            pods.set(target, { ...targetPod, status: "merged", updated_at: event.timestamp });
          }
        }
        break;
      }
      case "split": {
        if (current) {
          pods.set(event.pod_id, { ...current, status: "split", updated_at: event.timestamp });
        }
        for (const target of event.target_pod_ids ?? []) {
          if (!pods.has(target)) {
            pods.set(target, {
              pod_id: target,
              name: `Pod ${target}`,
              revenue_share: 1,
              members: [],
              status: "active",
              created_at: event.timestamp,
              updated_at: event.timestamp,
            });
          }
        }
        break;
      }
      case "dissolve": {
        if (current) {
          pods.set(event.pod_id, { ...current, status: "dissolved", updated_at: event.timestamp });
        }
        break;
      }
      case "revenue_share_update": {
        if (current) {
          pods.set(event.pod_id, {
            ...current,
            revenue_share: clampShare(event.revenue_share),
            updated_at: event.timestamp,
          });
        }
        break;
      }
      case "member_add": {
        if (current && event.members) {
          const merged = [...current.members];
          for (const member of event.members) {
            if (!merged.find((item) => item.member_id === member.member_id)) merged.push(member);
          }
          pods.set(event.pod_id, { ...current, members: merged, updated_at: event.timestamp });
        }
        break;
      }
      case "member_remove": {
        if (current && event.members) {
          const removed = new Set(event.members.map((member) => member.member_id));
          const nextMembers = current.members.filter((member) => !removed.has(member.member_id));
          pods.set(event.pod_id, { ...current, members: nextMembers, updated_at: event.timestamp });
        }
        break;
      }
      default:
        break;
    }
  };

  for (const event of events) {
    applyEvent(event);
  }

  const orderedPods = Array.from(pods.values()).sort((a, b) => a.pod_id.localeCompare(b.pod_id));
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  return { pods: orderedPods, lastEvent };
};

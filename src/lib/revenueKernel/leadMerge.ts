export type LeadRecord = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  created_at: string;
  data?: Record<string, unknown>;
};

export type MergeEvent = {
  event_id: string;
  primary_id: string;
  merged_ids: string[];
  before_summary: string;
  after_summary: string;
  timestamp: string;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const MERGE_PREFIX = "ppp:leadMergeLedger:v1::";

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
};

export const recordMergeEvent = (identity: string, event: MergeEvent, storage?: StorageLike): MergeEvent => {
  const resolved = resolveStorage(storage);
  if (!resolved) return event;
  try {
    const key = `${MERGE_PREFIX}${identity}`;
    const raw = resolved.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as MergeEvent[]) : [];
    const next = Array.isArray(parsed) ? [...parsed, event] : [event];
    resolved.setItem(key, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
  return event;
};

const normalizeEmail = (value?: string) => (value || "").trim().toLowerCase();
const normalizePhone = (value?: string) => (value || "").replace(/[^0-9]/g, "");

const leadKey = (lead: LeadRecord): string => {
  const email = normalizeEmail(lead.email);
  const phone = normalizePhone(lead.phone);
  return email || phone || lead.id;
};

const pickValue = (current?: string, candidate?: string) => (current && current.trim() ? current : candidate || current);

export const mergeLeads = (
  existing: LeadRecord[],
  incoming: LeadRecord,
  timestamp: string
): { merged: LeadRecord; mergeEvent?: MergeEvent } => {
  const key = leadKey(incoming);
  const matches = existing.filter((lead) => leadKey(lead) === key);
  if (matches.length === 0) {
    return { merged: incoming };
  }

  const ordered = [...matches, incoming].sort((a, b) => {
    if (a.created_at === b.created_at) return a.id.localeCompare(b.id);
    return a.created_at.localeCompare(b.created_at);
  });
  const primary = ordered[0];

  const merged: LeadRecord = {
    ...primary,
    name: pickValue(primary.name, incoming.name),
    email: pickValue(primary.email, incoming.email),
    phone: pickValue(primary.phone, incoming.phone),
    data: { ...(primary.data || {}), ...(incoming.data || {}) },
  };

  const mergedIds = ordered.slice(1).map((lead) => lead.id);
  const mergeEvent: MergeEvent = {
    event_id: `merge-${primary.id}-${timestamp}`,
    primary_id: primary.id,
    merged_ids: mergedIds,
    before_summary: `matched:${ordered.map((lead) => lead.id).join(",")}`,
    after_summary: `primary:${primary.id}`,
    timestamp,
  };

  return { merged, mergeEvent };
};

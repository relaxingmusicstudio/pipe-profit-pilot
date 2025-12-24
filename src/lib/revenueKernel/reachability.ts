import type { EvidenceRef } from "./evidence";
import type { ConsentStatus } from "./consent";

export type PhoneType = "mobile" | "landline" | "unknown";
export type Channel = "sms" | "voice" | "email" | "none";
export type ContactChannel = Exclude<Channel, "none">;
export type VoiceOutcome = "answered" | "voicemail_left" | "no_answer" | "busy" | "failed";
export const VOICE_OUTCOMES: VoiceOutcome[] = ["answered", "voicemail_left", "no_answer", "busy", "failed"];
export type ChannelPermission = "yes" | "no" | "unknown";

export type PhoneEntry = {
  e164: string;
  type: PhoneType;
  verified: boolean;
};

export type ReachabilityProfile = {
  phones: PhoneEntry[];
  channels_allowed: {
    sms: ChannelPermission;
    voice: ChannelPermission;
    email: ChannelPermission;
  };
  best_channel: Channel;
  fallback_order: Channel[];
  last_contact_at?: string;
  contact_attempts: {
    sms: number;
    voice: number;
    email: number;
  };
  do_not_contact: boolean;
  last_outcomes: Record<Channel, string | null>;
  consent_status: ConsentStatus;
  consent_evidence_ref?: EvidenceRef;
};

const hasEmail = (email?: string | null) => !!email && email.trim().length > 0;

const hasPhone = (phones: PhoneEntry[]) => phones.length > 0;

const computeAllowed = (phones: PhoneEntry[], email?: string | null): ReachabilityProfile["channels_allowed"] => {
  const hasAnyPhone = hasPhone(phones);
  const hasMobile = phones.some((p) => p.type === "mobile" && p.verified);
  const hasLandline = phones.some((p) => p.type === "landline");
  const hasUnknown = phones.some((p) => p.type === "unknown");

  const smsAllowed: ChannelPermission = hasMobile ? "yes" : hasUnknown || hasLandline ? "no" : "no";
  const voiceAllowed: ChannelPermission = hasAnyPhone ? "yes" : "no";
  const emailAllowed: ChannelPermission = hasEmail(email) ? "yes" : "no";

  return {
    sms: smsAllowed,
    voice: voiceAllowed,
    email: emailAllowed,
  };
};

const computeBestChannel = (allowed: ReachabilityProfile["channels_allowed"]): { best: Channel; fallback: Channel[] } => {
  const fallback: Channel[] = [];
  if (allowed.sms === "yes") fallback.push("sms");
  if (allowed.voice === "yes") fallback.push("voice");
  if (allowed.email === "yes") fallback.push("email");

  if (fallback.length === 0) {
    return { best: "none", fallback: ["none"] };
  }

  return { best: fallback[0], fallback };
};

export const buildReachabilityProfile = (input: {
  phones: PhoneEntry[];
  email?: string | null;
  consent_status: ConsentStatus;
  consent_evidence_ref?: EvidenceRef;
  do_not_contact?: boolean;
}): ReachabilityProfile => {
  const channels_allowed = computeAllowed(input.phones, input.email);
  const { best, fallback } = computeBestChannel(channels_allowed);

  return {
    phones: input.phones,
    channels_allowed,
    best_channel: best,
    fallback_order: fallback,
    last_contact_at: undefined,
    contact_attempts: { sms: 0, voice: 0, email: 0 },
    do_not_contact: Boolean(input.do_not_contact),
    last_outcomes: { sms: null, voice: null, email: null, none: null },
    consent_status: input.consent_status,
    consent_evidence_ref: input.consent_evidence_ref,
  };
};

export const selectChannel = (profile: ReachabilityProfile): { channel: Channel; reason?: string } => {
  if (profile.do_not_contact) {
    return { channel: "none", reason: "DO_NOT_CONTACT" };
  }
  if (profile.best_channel === "none") {
    return { channel: "none", reason: "NO_REACHABLE_CHANNELS" };
  }
  return { channel: profile.best_channel };
};

export const canUseChannel = (
  profile: ReachabilityProfile,
  channel: Channel
): { ok: boolean; reason?: string } => {
  if (profile.do_not_contact) return { ok: false, reason: "DO_NOT_CONTACT" };
  if (channel === "sms" && profile.channels_allowed.sms !== "yes") return { ok: false, reason: "SMS_NOT_ALLOWED" };
  if (channel === "voice" && profile.channels_allowed.voice !== "yes") return { ok: false, reason: "VOICE_NOT_ALLOWED" };
  if (channel === "email" && profile.channels_allowed.email !== "yes") return { ok: false, reason: "EMAIL_NOT_ALLOWED" };
  if (channel === "none") return { ok: false, reason: "NO_REACHABLE_CHANNELS" };
  return { ok: true };
};

export const applyDnc = (
  profile: ReachabilityProfile,
  evidence_ref: EvidenceRef
): ReachabilityProfile => ({
  ...profile,
  do_not_contact: true,
  consent_evidence_ref: evidence_ref,
});

export const recordOutcome = (
  profile: ReachabilityProfile,
  channel: ContactChannel,
  outcome: string,
  timestamp: string
): ReachabilityProfile => ({
  ...profile,
  last_contact_at: timestamp,
  contact_attempts: {
    ...profile.contact_attempts,
    [channel]: profile.contact_attempts[channel] + 1,
  },
  last_outcomes: {
    ...profile.last_outcomes,
    [channel]: outcome,
  },
});

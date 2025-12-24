export type ThrottleCaps = {
  perDay: number;
  perHour: number;
};

export type WarmupConfig = {
  enabled: boolean;
  rampLimit: number;
};

export type ChannelCounts = {
  dayCount: number;
  hourCount: number;
  bounceFlag?: boolean;
  complaintFlag?: boolean;
  cooldownRemaining?: number;
};

export type ThrottleState = {
  caps: ThrottleCaps;
  warmup: WarmupConfig;
  countsByKey: Record<string, ChannelCounts>;
};

export type ThrottleResult = {
  allowed: boolean;
  reason?: string;
  effectiveCaps: ThrottleCaps;
  cooldownRemaining: number;
};

const applyWarmup = (caps: ThrottleCaps, warmup: WarmupConfig): ThrottleCaps => {
  if (!warmup.enabled) return caps;
  const perDay = Math.min(caps.perDay, Math.max(1, warmup.rampLimit));
  const perHour = Math.min(caps.perHour, Math.max(1, Math.floor(warmup.rampLimit / 24) || 1));
  return { perDay, perHour };
};

export const checkThrottle = (
  state: ThrottleState,
  key: string
): ThrottleResult => {
  const counts = state.countsByKey[key] || { dayCount: 0, hourCount: 0 };
  const effectiveCaps = applyWarmup(state.caps, state.warmup);

  if (counts.cooldownRemaining && counts.cooldownRemaining > 0) {
    return {
      allowed: false,
      reason: "COOLDOWN_ACTIVE",
      effectiveCaps,
      cooldownRemaining: counts.cooldownRemaining,
    };
  }

  if (counts.bounceFlag || counts.complaintFlag) {
    return {
      allowed: false,
      reason: "DELIVERABILITY_COOLDOWN",
      effectiveCaps,
      cooldownRemaining: counts.cooldownRemaining || 1,
    };
  }

  if (counts.dayCount >= effectiveCaps.perDay) {
    return {
      allowed: false,
      reason: "CAP_DAILY",
      effectiveCaps,
      cooldownRemaining: 0,
    };
  }

  if (counts.hourCount >= effectiveCaps.perHour) {
    return {
      allowed: false,
      reason: "CAP_HOURLY",
      effectiveCaps,
      cooldownRemaining: 0,
    };
  }

  return {
    allowed: true,
    effectiveCaps,
    cooldownRemaining: 0,
  };
};

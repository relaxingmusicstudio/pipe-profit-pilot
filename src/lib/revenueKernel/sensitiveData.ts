export type SensitiveCategory = "personal" | "medical" | "financial" | "emotional" | "behavioral";

export type SensitiveContext = {
  categories?: SensitiveCategory[];
  acknowledged?: boolean;
  triggersAction?: boolean;
  optimizationTargets?: string[];
};

const normalizeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

const normalizeCategories = (categories?: SensitiveCategory[]): SensitiveCategory[] => {
  const allowed: SensitiveCategory[] = ["personal", "medical", "financial", "emotional", "behavioral"];
  return Array.isArray(categories) ? categories.filter((item) => allowed.includes(item)) : [];
};

export const evaluateSensitiveContext = (context?: SensitiveContext): {
  ok: boolean;
  reason?: string;
  categories: SensitiveCategory[];
} => {
  if (!context) return { ok: true, categories: [] };
  const categories = normalizeCategories(context.categories);
  const acknowledged = context.acknowledged === true;
  const triggersAction = context.triggersAction === true;
  const optimizationTargets = normalizeList(context.optimizationTargets);

  if (triggersAction && categories.length > 0) {
    return { ok: false, reason: "SENSITIVE_TRIGGER", categories };
  }

  if (categories.length > 0 && !acknowledged) {
    return { ok: false, reason: "SENSITIVE_ACK_REQUIRED", categories };
  }

  if (categories.length > 0 && optimizationTargets.length > 0) {
    const categoryHits = categories.filter((category) => optimizationTargets.includes(category));
    if (categoryHits.length > 0) {
      return { ok: false, reason: "SENSITIVE_OPTIMIZATION", categories: categoryHits };
    }
  }

  return { ok: true, categories };
};

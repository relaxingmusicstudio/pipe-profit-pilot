import { describe, expect, it } from "vitest";
import { MAINTENANCE_BOT_RULES, buildMaintenanceReport } from "../../src/lib/maintenanceBotCore.js";

describe("maintenance bot constraints", () => {
  it("cannot execute or modify data", () => {
    expect(MAINTENANCE_BOT_RULES.canTriggerActions).toBe(false);
    expect(MAINTENANCE_BOT_RULES.canModifyData).toBe(false);
    expect(MAINTENANCE_BOT_RULES.canOverrideHumans).toBe(false);
  });

  it("reports drift without action recommendations or prioritization", () => {
    const input = {
      featureName: "test",
      declaredOptimizationTargets: [],
      intentsPresent: true,
      appendOnlyPreserved: true,
      requiresHumanApprovalForR3: true,
      mockMode: true,
      allowIntentlessInMock: false,
    };
    const report = buildMaintenanceReport(input);
    for (const note of report.recommendations) {
      expect(note.startsWith("Observation:")).toBe(true);
    }
    expect("priority" in report).toBe(false);
  });

  it("has no memory of past opinions", () => {
    const input = {
      featureName: "memory-test",
      declaredOptimizationTargets: [],
      intentsPresent: true,
      appendOnlyPreserved: true,
      requiresHumanApprovalForR3: true,
      mockMode: true,
      allowIntentlessInMock: false,
    };
    const reportA = buildMaintenanceReport(input);
    const reportB = buildMaintenanceReport(input);
    expect(reportA).toEqual(reportB);
  });
});

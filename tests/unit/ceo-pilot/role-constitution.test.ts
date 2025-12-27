import { describe, expect, it } from "vitest";
import { enforceRoleConstitution } from "../../../src/lib/ceoPilot/roleConstitution";
import { DEFAULT_AGENT_IDS } from "../../../src/lib/ceoPilot/agents";
import { buildTestAgentContext } from "../helpers/agentContext";
import { loadRoleConstitutionAudits, saveRolePolicies } from "../../../src/lib/ceoPilot/runtimeState";
import type { RolePolicy } from "../../../src/lib/ceoPilot/contracts";

const NOW = "2025-01-01T00:00:00.000Z";

describe("ceoPilot role constitution", () => {
  it("denies explicitly denied actions even with high confidence", () => {
    const identityKey = "test:role:denied";
    const policy: RolePolicy = {
      policyId: "role-policy-revenue-test",
      roleId: "revenue_ops",
      roleName: "Revenue Operator",
      version: "test",
      jurisdiction: {
        domains: ["revenue"],
        actions: ["system_override"],
      },
      authorityCeiling: {
        maxPermissionTier: "execute",
        maxTaskClass: "high_risk",
        maxImpact: "irreversible",
        maxEstimatedCostCents: 5000,
      },
      deniedActions: ["system_override"],
      escalationRules: {
        alwaysEscalateActions: [],
        alwaysEscalateDomains: [],
      },
      chainOfCommand: {
        canRequestFromRoles: [],
        canApproveForRoles: [],
      },
      dataAccess: {
        allowedCategories: ["internal"],
      },
      toolAccess: {
        allowedTools: ["system_override"],
        allowedContracts: [],
      },
      auditRequirements: {
        requiredFields: ["roleId", "action", "decision", "reasonCode", "policyId", "policyVersion", "createdAt"],
      },
      createdAt: NOW,
      updatedAt: NOW,
    };

    saveRolePolicies(identityKey, [policy]);

    const context = buildTestAgentContext("system_override", {
      agentId: DEFAULT_AGENT_IDS.revenue,
      actionDomain: "revenue",
      decisionType: "system_override",
      tool: "system_override",
      permissionTier: "execute",
      taskClass: "routine",
      impact: "reversible",
      dataCategories: ["internal"],
      confidence: {
        confidenceScore: 0.99,
        uncertaintyExplanation: "high confidence",
        knownBlindSpots: ["none"],
        evidenceRefs: ["test:evidence"],
      },
    });

    const result = enforceRoleConstitution({ identityKey, agentContext: context, now: NOW });
    expect(result.decision.decision).toBe("deny");
    expect(result.decision.reasonCode).toBe("denied_action");
  });

  it("allows an action for one role while denying another", () => {
    const identityKey = "test:role:jurisdiction";
    const allowedContext = buildTestAgentContext("task", {
      agentId: DEFAULT_AGENT_IDS.ceo,
      actionDomain: "ceo",
      decisionType: "task",
      tool: "task",
      permissionTier: "suggest",
    });
    const deniedContext = buildTestAgentContext("task", {
      agentId: DEFAULT_AGENT_IDS.revenue,
      actionDomain: "ceo",
      decisionType: "task",
      tool: "task",
      permissionTier: "execute",
    });

    const allowed = enforceRoleConstitution({ identityKey, agentContext: allowedContext, now: NOW });
    const denied = enforceRoleConstitution({ identityKey, agentContext: deniedContext, now: NOW });

    expect(allowed.decision.decision).toBe("allow");
    expect(denied.decision.decision).toBe("deny");
    expect(denied.decision.reasonCode).toBe("jurisdiction_domain_denied");
  });

  it("escalates when authority ceiling is exceeded", () => {
    const identityKey = "test:role:escalate";
    const context = buildTestAgentContext("task", {
      agentId: DEFAULT_AGENT_IDS.ceo,
      actionDomain: "ceo",
      decisionType: "task",
      tool: "task",
      permissionTier: "suggest",
      taskClass: "novel",
      impact: "irreversible",
    });

    const result = enforceRoleConstitution({ identityKey, agentContext: context, now: NOW });
    expect(result.decision.decision).toBe("escalate");
    expect(result.decision.reasonCode).toBe("authority_impact_exceeded");
  });

  it("blocks decision laundering via handoff outside requester jurisdiction", () => {
    const identityKey = "test:role:handoff";
    const context = buildTestAgentContext("task", {
      agentId: DEFAULT_AGENT_IDS.ceo,
      actionDomain: "ceo",
      decisionType: "task",
      tool: "task",
      permissionTier: "suggest",
      handoff: {
        handoffId: "handoff-1",
        fromAgentId: DEFAULT_AGENT_IDS.revenue,
        toAgentId: DEFAULT_AGENT_IDS.ceo,
        taskId: "task-handoff",
        summary: "Request CEO action outside requester scope",
        assumptions: [],
        unresolvedRisks: [],
        confidence: 0.6,
        requiredTools: ["task"],
        createdAt: NOW,
      },
    });

    const result = enforceRoleConstitution({ identityKey, agentContext: context, now: NOW });
    expect(result.decision.decision).toBe("deny");
    expect(result.decision.reasonCode).toBe("handoff_request_outside_jurisdiction");
  });

  it("records required audit log fields", () => {
    const identityKey = "test:role:audit";
    const context = buildTestAgentContext("task", {
      agentId: DEFAULT_AGENT_IDS.ceo,
      actionDomain: "ceo",
      decisionType: "task",
      tool: "task",
      permissionTier: "suggest",
    });

    const result = enforceRoleConstitution({ identityKey, agentContext: context, now: NOW });
    expect(result.audit.roleId).toBe("ceo");
    expect(result.audit.action).toBe("task");
    expect(result.audit.decision).toBe(result.decision.decision);
    expect(result.audit.reasonCode.length).toBeGreaterThan(0);
    expect(result.audit.policyId.length).toBeGreaterThan(0);
    expect(result.audit.policyVersion.length).toBeGreaterThan(0);
    expect(result.audit.createdAt).toBe(NOW);

    const audits = loadRoleConstitutionAudits(identityKey);
    expect(audits.length).toBeGreaterThan(0);
    const latest = audits[audits.length - 1];
    expect(latest.roleId).toBe("ceo");
    expect(latest.reasonCode.length).toBeGreaterThan(0);
  });
});

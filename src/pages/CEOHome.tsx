// src/pages/CEOHome.tsx
/**
 * PHASE 1 LOCK ?
 * - [LOCKED] Page renders without crashing
 * - [LOCKED] Helmet works because main.tsx provides <HelmetProvider>
 * - [TODO-P2] Mount CEO agent chat + onboarding panels once Phase 1 stable
 */

import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { getOnboardingData } from "@/lib/onboarding";
import { useCEOAgent } from "@/hooks/useCEOAgent";
import { CEOPlan, computeOnboardingHash, loadCEOPlan, saveCEOPlan } from "@/lib/ceoPlan";
import {
  ChecklistItem,
  ChecklistState,
  DoNextState,
  DoNextHistoryEntry,
  getPlanChecklist,
  loadChecklistState,
  loadDoNextState,
  loadDoNextHistory,
  parseDoNextPayload,
  parsePlanToChecklist,
  saveChecklistState,
  saveDoNextState,
  recordDoNextHistoryEntry,
} from "@/lib/ceoChecklist";

export default function CEOHome() {
  const { email, role, signOut, userId } = useAuth();
  const { status, isOnboardingComplete } = useOnboardingStatus();
  const navigate = useNavigate();
  const context = getOnboardingData(userId, email);
  const { askCEO, isLoading: agentLoading } = useCEOAgent();

  const [plan, setPlan] = useState<CEOPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistState, setChecklistState] = useState<ChecklistState>({ completedIds: [], updatedAt: null });
  const [actionPlan, setActionPlan] = useState<DoNextState | null>(null);
  const [doNextLoading, setDoNextLoading] = useState(false);
  const [doNextHistory, setDoNextHistory] = useState<DoNextHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<string | null>(null);
  const [isMockMode, setIsMockMode] = useState(
    () =>
      import.meta.env.VITE_MOCK_AUTH === "true" ||
      (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true")
  );

  const hasContext =
    !!context.businessName ||
    !!context.industry ||
    !!context.serviceArea ||
    !!context.primaryGoal ||
    !!context.offerPricing;

  const onboardingHash = useMemo(() => computeOnboardingHash(userId, email), [userId, email, context]);
  const allowPlanSections = isOnboardingComplete || isMockMode;

  useEffect(() => {
    const mockFlag =
      import.meta.env.VITE_MOCK_AUTH === "true" ||
      (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true");
    setIsMockMode(mockFlag);
  }, []);

  useEffect(() => {
    let existingPlan = loadCEOPlan(userId, email);
    if (!existingPlan && isMockMode) {
      existingPlan = {
        planMarkdown: getMockPlanMarkdown(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        onboardingSnapshotHash: onboardingHash,
      };
      saveCEOPlan(existingPlan, userId, email);
    }
    setPlan(existingPlan);
    setChecklist(existingPlan ? parsePlanToChecklist(existingPlan.planMarkdown) : getPlanChecklist(userId, email));
    setChecklistState(loadChecklistState(userId, email));
    setActionPlan(loadDoNextState(userId, email));
    setDoNextHistory(loadDoNextHistory(userId, email));
  }, [userId, email, isMockMode, onboardingHash]);

  useEffect(() => {
    if (plan?.planMarkdown) {
      setChecklist(parsePlanToChecklist(plan.planMarkdown));
    }
  }, [plan]);

  const handleGeneratePlan = async () => {
    setPlanLoading(true);
    const resp = await askCEO(
      "Generate a concise CEO plan using the provided onboarding context. Return markdown with sections: Goals, Offers, ICP, Lead Sources, Next 7 Days.",
      "30d",
      [],
      undefined,
      "generate_ceo_plan"
    );
    if (resp?.response) {
      const next: CEOPlan = {
        planMarkdown: resp.response,
        createdAt: plan?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        onboardingSnapshotHash: onboardingHash,
      };
      saveCEOPlan(next, userId, email);
      setPlan(next);
      const parsed = parsePlanToChecklist(next.planMarkdown);
      setChecklist(parsed);
      saveChecklistState({ completedIds: [], updatedAt: new Date().toISOString() }, userId, email);
      setChecklistState({ completedIds: [], updatedAt: new Date().toISOString() });
    }
    setPlanLoading(false);
  };

  const planOutOfDate = plan && plan.onboardingSnapshotHash !== onboardingHash;

  const toggleChecklist = (id: string) => {
    const completed = new Set(checklistState.completedIds);
    if (completed.has(id)) {
      completed.delete(id);
    } else {
      completed.add(id);
    }
    const nextState: ChecklistState = { completedIds: Array.from(completed), updatedAt: new Date().toISOString() };
    setChecklistState(nextState);
    saveChecklistState(nextState, userId, email);
  };

  const incompleteItems = checklist.filter((item) => !checklistState.completedIds.includes(item.id));
  const todaysTop3 = incompleteItems.slice(0, 3);
  const nextTask = incompleteItems[0];

  const handleDoNext = async () => {
    if (!nextTask) return;
    setDoNextLoading(true);
    const agentIntent = "ceo_do_next";
    let rawResponse = "";

    if (!isMockMode) {
      const resp = await askCEO(
        `You are PipelinePRO's CEO execution coach. For the task "${nextTask.text}", return a JSON block wrapped in \`\`\`json ... \`\`\` with fields: title, objective, steps[{label, expectedOutcome, estimatedMinutes}], successCriteria[], blockers[], escalationPrompt. If you cannot format JSON, fall back to concise markdown bullets with expected outcomes.`,
        "7d",
        [],
        undefined,
        agentIntent
      );
      rawResponse = resp?.response ?? "";
    }

    if (!rawResponse) {
      rawResponse = buildMockDoNextResponse(nextTask.text);
    }

    const parsedPayload = parseDoNextPayload(rawResponse);
    const next: DoNextState = {
      taskId: nextTask.id,
      responseMarkdown: rawResponse,
      parsedJson: parsedPayload,
      updatedAt: new Date().toISOString(),
      agentIntent,
      checklistItemText: nextTask.text,
      rawResponse,
    };

    setActionPlan(next);
    saveDoNextState(next, userId, email);

    const historyEntry: DoNextHistoryEntry = {
      createdAt: next.updatedAt,
      checklistItemId: nextTask.id,
      checklistItemText: nextTask.text,
      agentIntent,
      rawResponse,
      parsedJson: parsedPayload,
    };

    const nextHistory = recordDoNextHistoryEntry(historyEntry, userId, email);
    setDoNextHistory(nextHistory);
    setSelectedHistoryKey(`${historyEntry.checklistItemId}-${historyEntry.createdAt}`);
    setHistoryOpen(true);
    setDoNextLoading(false);
  };

  const handleSelectHistory = (entry: DoNextHistoryEntry) => {
    const selected: DoNextState = {
      taskId: entry.checklistItemId,
      responseMarkdown: entry.rawResponse,
      parsedJson: entry.parsedJson,
      updatedAt: entry.createdAt,
      agentIntent: entry.agentIntent,
      checklistItemText: entry.checklistItemText,
      rawResponse: entry.rawResponse,
    };
    setActionPlan(selected);
    setSelectedHistoryKey(`${entry.checklistItemId}-${entry.createdAt}`);
    saveDoNextState(selected, userId, email);
  };

  return (
    <div data-testid="dashboard-home" style={{ padding: 24, fontFamily: "system-ui" }}>
      <Helmet>
        <title>PipelinePRO - CEO</title>
      </Helmet>

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>CEO Home</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        Signed in as <b>{email ?? "unknown"}</b> - role: <b>{role}</b>
      </div>

      {status === "in_progress" && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Finish onboarding</div>
          <p style={{ marginBottom: 10, opacity: 0.8 }}>
            You started onboarding. Resume to finalize the CEO Agent setup.
          </p>
          <button
            data-testid="resume-onboarding"
            onClick={() => navigate("/app/onboarding")}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Resume onboarding
          </button>
        </div>
      )}

      {allowPlanSections && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Business Context</div>
            {!hasContext && (
              <button
                onClick={() => navigate("/app/onboarding")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Re-run onboarding
              </button>
            )}
          </div>
          {!hasContext && (
            <div style={{ marginBottom: 8, color: "#b7791f", fontWeight: 600 }}>
              Onboarding data is missing or incomplete. Re-run onboarding to fill it in.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
            <ContextField label="Business name" value={context.businessName} />
            <ContextField label="Industry" value={context.industry} />
            <ContextField label="Service area" value={context.serviceArea} />
            <ContextField label="Primary goal" value={context.primaryGoal} />
            <ContextField label="Offer & pricing" value={context.offerPricing} />
          </div>
        </div>
      )}

      {allowPlanSections && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 16, display: "flex", gap: 8, alignItems: "center" }}>
              CEO Plan
              {planOutOfDate && (
                <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e", fontSize: 12 }}>
                  Plan out of date
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleGeneratePlan}
                disabled={agentLoading || planLoading}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  fontWeight: 700,
                  opacity: agentLoading || planLoading ? 0.6 : 1,
                }}
              >
                {plan ? "Regenerate" : "Generate CEO Plan"}
              </button>
            </div>
          </div>
          {plan && (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                padding: 12,
                background: "white",
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              {plan.planMarkdown}
            </div>
          )}
          {!plan && (
            <div style={{ opacity: 0.7 }}>No plan generated yet. Use your onboarding data to draft a CEO action plan.</div>
          )}
        </div>
      )}

      {allowPlanSections && plan && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "rgba(0,0,0,0.02)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Execution Checklist</div>
          <div style={{ marginBottom: 8, fontWeight: 700 }}>Today’s Top 3</div>
          {todaysTop3.length === 0 ? (
            <div style={{ opacity: 0.7, marginBottom: 12 }}>All caught up for today.</div>
          ) : (
            <ul style={{ marginBottom: 12, paddingLeft: 18 }}>
              {todaysTop3.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          )}
          <div style={{ marginBottom: 8, fontWeight: 700 }}>Full checklist</div>
          <div style={{ display: "grid", gap: 6 }}>
            {checklist.length === 0 && <div style={{ opacity: 0.7 }}>No checklist items parsed from the plan.</div>}
            {checklist.map((item) => (
              <label key={item.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={checklistState.completedIds.includes(item.id)}
                  onChange={() => toggleChecklist(item.id)}
                />
                <span>{item.text}</span>
                {item.section && <span style={{ opacity: 0.6, fontSize: 12 }}>({item.section})</span>}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              onClick={handleDoNext}
              disabled={!nextTask || doNextLoading || agentLoading}
              data-testid="do-next-button"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: nextTask ? "pointer" : "not-allowed",
                fontWeight: 700,
                opacity: !nextTask || doNextLoading || agentLoading ? 0.6 : 1,
              }}
            >
              {nextTask ? "Do Next" : "All tasks complete"}
            </button>
          </div>
          {actionPlan && (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                padding: 12,
                background: "white",
                marginTop: 12,
              }}
              data-testid="do-next-output"
            >
              {actionPlan.parsedJson ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{actionPlan.parsedJson.title}</div>
                    <div style={{ opacity: 0.75 }}>{actionPlan.parsedJson.objective}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Steps</div>
                    <ol style={{ marginLeft: 18, display: "grid", gap: 6 }}>
                      {actionPlan.parsedJson.steps.map((step, idx) => (
                        <li key={idx}>
                          <div style={{ fontWeight: 700 }}>{step.label}</div>
                          <div style={{ opacity: 0.8 }}>{step.expectedOutcome}</div>
                          {typeof step.estimatedMinutes === "number" && (
                            <div style={{ opacity: 0.65, fontSize: 12 }}>~{step.estimatedMinutes} min</div>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                  {actionPlan.parsedJson.successCriteria.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Success criteria</div>
                      <ul style={{ marginLeft: 16 }}>
                        {actionPlan.parsedJson.successCriteria.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {actionPlan.parsedJson.blockers.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Potential blockers</div>
                      <ul style={{ marginLeft: 16 }}>
                        {actionPlan.parsedJson.blockers.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>If blocked</div>
                    <div style={{ opacity: 0.8 }}>{actionPlan.parsedJson.escalationPrompt}</div>
                  </div>
                </div>
              ) : (
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontFamily: "Inter, system-ui, sans-serif" }}>
                  {actionPlan.responseMarkdown}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setHistoryOpen((open) => !open)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.15)",
                cursor: "pointer",
                fontWeight: 700,
                background: historyOpen ? "rgba(0,0,0,0.05)" : "white",
              }}
              data-testid="do-next-history-toggle"
            >
              Do Next History ({doNextHistory.length})
            </button>
            {historyOpen && (
              <div
                style={{
                  marginTop: 8,
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 8,
                  padding: 10,
                  background: "white",
                }}
                data-testid="do-next-history-list"
              >
                {doNextHistory.length === 0 && <div style={{ opacity: 0.7 }}>No history yet.</div>}
                {doNextHistory.length > 0 && (
                  <div style={{ display: "grid", gap: 6 }}>
                    {doNextHistory.map((entry) => {
                      const key = `${entry.checklistItemId}-${entry.createdAt}`;
                      const title = entry.parsedJson?.title || entry.checklistItemText || "Do Next run";
                      return (
                        <button
                          key={key}
                          onClick={() => handleSelectHistory(entry)}
                          style={{
                            textAlign: "left",
                            borderRadius: 8,
                            border: "1px solid rgba(0,0,0,0.08)",
                            padding: "8px 10px",
                            background: selectedHistoryKey === key ? "rgba(0,0,0,0.05)" : "white",
                            cursor: "pointer",
                          }}
                          data-testid="do-next-history-item"
                        >
                          <div style={{ fontWeight: 700 }}>{title}</div>
                          <div style={{ opacity: 0.7, fontSize: 12 }}>
                            {new Date(entry.createdAt).toLocaleString()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        data-testid="sign-out"
        onClick={() => signOut()}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Sign out
      </button>

      <button
        data-testid="go-integrations"
        onClick={() => navigate("/app/integrations")}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          cursor: "pointer",
          fontWeight: 700,
          marginLeft: 12,
        }}
      >
        Integrations
      </button>

      <hr style={{ margin: "24px 0", opacity: 0.2 }} />

      <div style={{ opacity: 0.85 }}>
        ? Phase 1: routing + auth + stability is the mission.  
        Next: we plug in the CEO Agent panel without breaking the app.
      </div>
    </div>
  );
}

const buildMockDoNextResponse = (taskText: string) => {
  const payload = {
    title: `Next step: ${taskText}`,
    objective: `Make clear progress on "${taskText}" today.`,
    steps: [
      {
        label: "Define the outcome",
        expectedOutcome: `Document what "done" means for ${taskText}.`,
        estimatedMinutes: 10,
      },
      {
        label: "Prepare resources",
        expectedOutcome: "List assets, people, and access needed to execute.",
        estimatedMinutes: 15,
      },
      {
        label: "Execute first move",
        expectedOutcome: "Complete the first concrete deliverable and share status.",
        estimatedMinutes: 20,
      },
    ],
    successCriteria: [
      "Outcome definition is shared and agreed",
      "Blockers and dependencies are documented",
      "Owner and timeline for next checkpoint are set",
    ],
    blockers: ["Waiting on approvals", "Missing access or assets"],
    escalationPrompt: "If blocked, ask: What decision or resource do we need to unblock this task today?",
  };

  return ["```json", JSON.stringify(payload, null, 2), "```"].join("\n");
};

const getMockPlanMarkdown = () =>
  [
    "## Goals",
    "- Draft landing page for spring promo",
    "- Launch Google Ads test",
    "- Follow up with warm leads",
    "",
    "## Next 7 Days",
    "1. Publish landing page with offer and booking form",
    "2. Set up two ad groups with $50/day budget",
    "3. Send follow-up emails to warm leads and book calls",
  ].join("\n");

const ContextField = ({ label, value }: { label: string; value?: string }) => (
  <div
    style={{
      padding: 10,
      borderRadius: 8,
      border: "1px solid rgba(0,0,0,0.1)",
      background: "white",
      minHeight: 64,
    }}
  >
    <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.6 }}>{label}</div>
    <div style={{ fontWeight: 700, marginTop: 4 }}>{value || "—"}</div>
  </div>
);

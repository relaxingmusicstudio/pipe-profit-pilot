# Evolution Contract (Kernel Stability)

## Purpose
Define what must remain invariant as the system evolves, while allowing safe module upgrades.

## Must Preserve (Invariants)
- Constitution remains immutable and enforced by policy/preflight.
- Intent must precede execution for any action.
- Evidence must be recorded for every execution attempt.
- Append-only ledgers; no destructive writes.
- Deterministic behavior for decisions and guards.

## May Evolve (Modules)
- Revenue pipeline modules (qualification, fulfillment, retention).
- UI read-only panels that surface kernel state.
- Provider integrations once proof requirements are met.

## Upgrade Process
1. Draft changes with a clear intent and scope.
2. Run policy/preflight and selftests.
3. Attach evidence for any irreversible or external action.
4. Record changes in append-only ledgers and docs.

## Amendments
- Changes that alter invariants require explicit human approval and proof artifacts.
- Constitution non-goals are never removed or weakened.

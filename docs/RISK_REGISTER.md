# Risk Register

Each entry is deterministic and owned. Status is either deferred or mitigated.

| risk_id | description | trigger | mitigation | owner | status | review_cadence |
| --- | --- | --- | --- | --- | --- | --- |
| auth-role-overload | Supabase RPC role overload conflict (PGRST203) remains unresolved. | Role check RPC fails with PGRST203. | Fix duplicate has_role overloads in DB layer. | platform | deferred | weekly |
| ceo-chat-panel-deferred | CEO agent chat panel remains deferred in CEOHome. | Phase 1 TODO in CEOHome not removed. | Implement chat mount in a dedicated iteration. | product | deferred | monthly |

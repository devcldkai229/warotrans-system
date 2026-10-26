# ADR 0011 — Traffic Operations (workflow + station policies)

## Status

Accepted (2026-10-25). Defaults remain **Shadow** / robot **legacy**. Active opt-in.

## Context

Graph, segmented coordinator, and MQTT Active Mode exist (ADR 0009/0010). Warehouse
operations still need validated station policies, HUMAN hold on real bays, cancel/
timeout without silent release, operator UI overlay, and structured ops logs —
without a second workflow engine or forbidden entities.

## Decision

1. **Station policies** are config/compile-driven (`Traffic:Stations` bay kinds +
   `bay:{endpointCode}` resources). `StationPolicyResolver` maps MOVE purpose →
   Inbound / Outbound / ShelfService / Inspection / Charging / Parking / RecoveryWait.
2. **JobExecutionEngine** (Active only) pre-holds bay/corridor before segment acquire;
   HUMAN holds the same compiled resources (not synthetic `service:…` when a bay exists).
3. **Traffic waiting** stays `pendingTraffic` on EXECUTING MOVE — never Workflow WAIT.
4. **Cancel** → `POST /jobs/{id}/cancel` + `CancelRequestAsync` (quarantine if occupied).
5. **HUMAN timeout** escalates via ops log + flag; **hold is kept**.
6. **Unhappy recovery** (no auto reverse when uncertain):

| Case | Action |
|------|--------|
| Stuck / no progress | MarkBlocked / FAULT; operator clearance |
| Localization lost | Quarantine; no new NAVIGATE |
| Blocked route | Replan if epoch valid; else wait/escalate |
| MQTT loss | Robot watchdog + backend connectivity quarantine |
| Restart | authority_state reconcile; no motion resume without new grant |
| Deadlock | Reject acquire; audited release-after-clearance |
| Unexpected pose | Reconcile → quarantine |
| Missed HUMAN confirm | Timeout escalate; hold kept |

7. **UI**: Fleet map polls `GET /api/fleet/traffic/snapshot`; authorized edges + wait/
   quarantine callouts. Manual release only via existing audited clearance API.
8. **Ops log**: `ITrafficOpsLog` structured events (request/grant/wait/service/…);
   no AI in the safety path.
9. **SHIFT**: not a StepType — use MOVE + HUMAN confirm when catalog needs handoff.
10. **Charging**: `BatteryPercent` + `MovePurpose.CHARGE` only; no invented BMS fields.

## Consequences

- Shadow path unchanged; Active gains station-aware holds.
- Inventory still not updated on MOVE success (confirm path only).
- Recovery travel never automatic without localization + authority.

## SAFETY REVIEW

| | |
|--|--|
| WHY | Keep physical ownership through warehouse stops and faults |
| FILES | Fleet StationPolicies, JobExecutionEngine, FleetMap, TrafficOpsLog |
| RISK | Wrong bay hold blocks capacity; UI snapshot lag |
| TEST | xUnit station/cancel/timeout; workflow regression; UI mapping |
| ROLLBACK | `Traffic:Mode=Shadow`; checkout `feature/traffic-active` / tag `pre-traffic-active` |

# ADR 0009 — Segmented traffic authority (Shadow → Active)

**Status:** Accepted (Shadow Mode implemented; Active Mode deferred)  
**Date:** 2026-10-25  
**Supersedes (partially):** ADR 0008 — on segment grants and release rules  
**Related:** ADR 0007

## Context

ADR 0008 ships whole-route grants with release on command result / offline. That
is insufficient for multi-robot fairness, deadlock prevention, verified clearance,
and continuous motion through safe stops. The target architecture is a single
backend Traffic Coordinator that grants **motion authority per safe-stop segment**.

## Decision

### Authority model
- **Occupancy** (physical hold of resources) and **MotionAuthority** (permission
  to traverse the next safe-stop segment) are distinct.
- Grants are atomic to the next safe stop; no hold-and-wait across multiple
  future segments.
- Release only after **verified physical exit** (pose outside swept footprint +
  localization OK) or **operator** `ReleaseAfterPhysicalClearance`.
- Timeout / lost heartbeat / cancel / localization loss → **Quarantine**
  (resources stay held). No auto-release on heartbeat alone.

### Runtime shape
- Single-writer `Channel<T>` actor; path search off the critical path; every
  candidate revalidated atomically.
- Per-resource queues with priority + aging; event-driven wakeup (no polling).
- Wait-for cycle detection rejects deadlock-causing grants.
- Fail-closed Host restart with epoch fencing; reconcile from open
  `RobotCommand.PayloadJson` route edges + telemetry.

### Shadow Mode (current)
- Segmented coordinator **observes** MOVE / telemetry / connectivity and logs
  comparison vs V1 whole-route grants.
- **Never** issues motion commands.
- `ShadowSingleMoverGuard`: at most one moving robot per map while Shadow.
- V1 `TrafficCoordinator` remains the active dispatcher until Active Mode.

### Active Mode criteria (deferred)
1. Integration + fault tests PASS; Shadow comparison stable.
2. Robot Traffic Client extends segment authority **before** arriving at the
   next safe stop so continuous motion is possible when already granted.
3. If authority is missing at the safe stop, robot stops there and reports.
4. Backend coordinator is the sole motion-authority issuer.
5. Robot uses Nav2 Route Server only (`ComputeRoute → FollowPath`); no free-planner fallback.
6. Do **not** chain multiple `NAVIGATE_TO_POSE` as the traffic enforcement mechanism.
7. No dual routing systems after cutover (delete V1 grant path).

### Station bay kinds
Configured via `Traffic:Stations` (endpoint code → bay kind). CHARGER/PARK may
also be inferred from `EndpointType`. No new EndpointType / entity / table.

## Consequences
- MQTT wire format unchanged in Shadow (reserved authority fields documented only).
- Still no persisted TrafficResource / TrafficReservation.

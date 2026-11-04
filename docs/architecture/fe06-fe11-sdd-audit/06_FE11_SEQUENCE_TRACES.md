# 06 — FE-11 Sequence Traces

Primary traces below use **Semantic** where noted; Active variants called out. Dual-robot Gazebo E2E success is **NOT claimed**.

---

## FE-11-SQ01 — Request Traffic Authorization and Move

**Mode focus:** Semantic (also analogous Active with Backend plan)  
**Status:** IMPLEMENTED in code; live dual PASS not claimed

| Step | From | To | Message | Sync | Status |
|---|---|---|---|---|---|
| 1 | Job/Fleet | Robot | MQTT NAVIGATE_TO_POSE | async | IMPLEMENTED |
| 2 | Nav2 | SemanticTrafficClient | `/plan` Path | async | IMPLEMENTED |
| 3 | Client | Backend | MQTT `traffic_plan` / TrafficPlanProposeMessage | async | IMPLEMENTED |
| 4 | RobotMqttIngress | TrafficProgressIngress | HandlePlanProposeAsync | sync | IMPLEMENTED |
| 5 | Ingress | SegmentedTrafficCoordinator | AcquireSemanticPlanAsync | sync-async actor | IMPLEMENTED |
| 6 | TrafficState | — | CanAcquire + WouldCreateWaitForCycle + Occupy | sync | IMPLEMENTED |
| 7a alt Grant | Publisher | Robot | EXTEND_AUTHORITY / AuthorityPayload (TTL) | async | IMPLEMENTED |
| 7b alt Wait | State | — | Enqueue waiter; no motion authority | — | IMPLEMENTED |
| 8 | Client | `/traffic/authority_ok` | Bool True @ ~20Hz | async | IMPLEMENTED |
| 9 | Gate | `/cmd_vel` | forward Twist | async | IMPLEMENTED |
| 10 | Nav2+HW | — | physical motion | — | FE-06; success CONFIG/runtime |

**Active variant:** Backend RoutePlanner → AcquireRouteAsync → NAVIGATE with Authority + SegmentEdgeIds → TrafficClient executes FollowPath → STOPPED_AWAITING → AdvanceRoute → EXTEND.

---

## FE-11-SQ02 — Two Robots Compete for Shared Resource

**Status:** IMPLEMENTED in unit tests; Gazebo dual Stage-3 goals **FAIL/NOT_RUN** per acceptance docs

| Step | Behavior | Status |
|---|---|---|
| 1 | SIM-01 Acquire succeeds → holds zone/cell or graph resources | IMPLEMENTED |
| 2 | SIM-02 Acquire overlaps → CanAcquire fails → Queue / WAIT | IMPLEMENTED |
| 3 | Optional: WouldCreateWaitForCycle → DEADLOCK_RISK reject | IMPLEMENTED |
| 4 | SIM-01 clears resources → ReportVerifiedExit / release | IMPLEMENTED (Semantic) |
| 5 | PromoteWaiters → SIM-02 grant | IMPLEMENTED |
| 6 | Live dual simultaneous NAV success | **NOT VERIFIED PASS** |

---

## FE-11-SQ03 — Replanning During Reservation

**Status:** IMPLEMENTED (Semantic replan path)

| Step | Behavior | Status |
|---|---|---|
| 1 | New `/plan` → new planRevision / traffic_plan | IMPLEMENTED |
| 2 | AcquireSemanticPlan with new resources | IMPLEMENTED |
| 3 | `RevokeAuthorityKeepOccupancy` / release outside new set helpers | IMPLEMENTED |
| 4 | Authority update MQTT; fingerprint/revision must match on robot | IMPLEMENTED |
| 5 | Gate closes until matching grant | IMPLEMENTED |

Active: new route request / cancel+reacquire — related APIs exist; treat carefully per job engine path.

---

## FE-11-SQ04 — Robot Offline / Localization Loss

**Status:** IMPLEMENTED (segmented path)

| Step | Behavior | Status |
|---|---|---|
| 1 | Heartbeat timeout → MarkOfflineAsync → Quarantine(OFFLINE), occupancy kept | IMPLEMENTED |
| 2 | AuthorityRevoked MQTT except LOCALIZATION_LOSS/OFFLINE keep-authority exceptions per code comments | IMPLEMENTED (verify branch in Quarantine) |
| 3 | Gate / supervisor zeros motion | IMPLEMENTED when gate on |
| 4 | Fresh heartbeat → MarkOnline clears OFFLINE only | IMPLEMENTED |
| 5 | Localization loss quarantine reason LOCALIZATION_LOSS | IMPLEMENTED |
| 6 | V1 Shadow offline auto-releases grant | IMPLEMENTED (different, less safe) |

---

## FE-11-SQ05 — Cancellation / Timeout / Failed Navigation

**Status:** PARTIALLY covered by CancelRequestAsync, CompleteRouteAsync, Quarantine CANCEL_WHILE_OCCUPIED, FAULT progress

| Step | Behavior | Status |
|---|---|---|
| 1 | CANCEL command / CompleteRoute failed → quarantine or clear authority | IMPLEMENTED paths |
| 2 | Occupancy not silently freed without clearance | IMPLEMENTED segmented |
| 3 | PromoteWaiters after verified free | IMPLEMENTED |
| 4 | Operator ReleaseAfterPhysicalClearanceAsync | IMPLEMENTED API |
| 5 | Full E2E matrix Gazebo | NOT_RUN / FAIL in docs |

---

## Conceptual vs actual MQTT names

| Concept | Actual |
|---|---|
| REQUEST | traffic_plan propose OR Acquire* APIs |
| GRANT | AuthorityGranted event → often EXTEND_AUTHORITY / NAVIGATE+Authority |
| WAIT | queue in TrafficState (no WAIT MQTT type) |
| EXTEND | EXTEND_AUTHORITY |
| RENEW | RENEW_AUTHORITY |
| REVOKE | REVOKE_AUTHORITY Mode STOP_NOW |
| RELEASE | ReportVerifiedExit / ReleaseResource (uplink clearedResourceIds) |

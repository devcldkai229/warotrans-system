# FE-06 & FE-11 Complete SDD Handoff

**Self-contained handoff for UML Class + Sequence diagrams without repository access.**  
**Inspection:** 2026-11-03 15:15:05 +07:00  
**SHAs:** warotrans-system `d1ee6c4c…f34d` · warotrans `b0e97552…5465`  
**Method:** Read-only source audit. Dual-robot Gazebo PASS is **not** claimed.

---

# Part A — Executive architecture overview

WaroTrans separates:

- **FE-06 Autonomous Navigation:** Robot local motion via Nav2 (plan/control/costmaps/recoveries), MQTT navigate commands, gateway action clients, optional LaneAwareNavfn, motors via `/cmd_vel` → ESP32.
- **FE-11 Multi-robot Coordination:** Backend Fleet in-memory traffic reservation + MQTT authority; robot TrafficClient/SemanticTrafficClient; CmdVelAuthorityGate fail-closed permission.

**Boundary:** FE-11 grants *permission* to move on reserved resources. FE-06 performs *how* to move and avoid obstacles. Dynamic obstacle handling is primarily Nav2 framework behavior.

**Modes (FE-11):** Shadow (code default), Active (Host appsettings default), Semantic (Simulation profile). Resource models differ—document modes separately.

---

# Part B — FE-06 implemented design

## Flow (legacy primary)

1. Backend publishes MQTT `NAVIGATE_TO_POSE` (`RobotCommandMessage` + `NavigateToPosePayload{FrameId,X,Y,Yaw}`).
2. `RobotGatewayNode` → `MoveCommandHandler.handle`.
3. Guards: localized, Nav2 ready, not busy.
4. `Nav2ActionNavigator.send_goal` → action `nav2_msgs/action/NavigateToPose` (`navigate_to_pose`).
5. BT (`navigate_to_pose_w_replanning_resilient.xml`) ComputePathToPose (Navfn default or LaneAware overlay) + FollowPath (RPP).
6. Pipeline: smoother → collision_monitor → [`/cmd_vel_safe` → gate if enabled] → `/cmd_vel` → `Esp32BridgeNode`.
7. Result uplink: `command_result` SUCCEEDED|FAILED|CANCELED; telemetry navStatus.

## Obstacle avoidance truth

- `/scan` → ObstacleLayer + Inflation on local/global costmaps.
- RPP collision detection; Collision Monitor approach.
- BT replan/clear/BackUp/Spin recoveries.
- **Not** a custom WaroTrans OA service class.
- Ultrasonic **not** in costmap → PARTIAL vs full low-obstacle requirement wording.

## LaneAwareNavfn (optional)

`warotrans_lane_planner::LaneAwareNavfn : nav2_core::GlobalPlanner`  
`createPlan(start, goal, cancel_checker) → Path`  
ONE_WAY reverse = HARD (`moveAllowed`); lane preference = SOFT cost factor.

## Active/Semantic motion variants

- Active: FollowPath segments via `Nav2SegmentExecutor` under `TrafficClient` (FE-11).
- Semantic: NavigateToPose continues but motion gated by semantic grants.

---

# Part C — FE-06 key class specifications

| Class | Lang | Key members |
|---|---|---|
| RobotCommandMessage | C# | Type, CommandId, Payload |
| NavigateToPosePayload | C# | FrameId, X, Y, Yaw, Authority? |
| MqttRobotCommandPublisher | C# | PublishAsync(msg) |
| RobotGatewayNode | Py | Node; traffic_mode; MQTT+Nav2 wiring |
| MoveCommandHandler | Py | handle(envelope, session)→AckDecision; request_cancel; tick |
| Nav2ActionNavigator | Py | is_ready(); send_goal(NavGoal, GoalTicket, GoalCallbacks); cancel_goal |
| NavGoal / NavResult | Py | pose fields; status/error |
| LaneAwareNavfn | C++ | createPlan; moveAllowed; inherits GlobalPlanner |
| AuthorityGateLogic | Py | on_authority_ok; decide→GateDecision; should_forward(..., max_age=0.3) |
| CmdVelAuthorityGate | Py | Node: /cmd_vel_safe→/cmd_vel gated by /traffic/authority_ok |
| Esp32BridgeNode | Py | /cmd_vel → serial |

**External «framework»:** bt_navigator, planner_server, controller_server, costmap layers, collision_monitor, amcl, rplidar.

---

# Part D — FE-06 exact sequence flows

## SQ01 NavigateToPose (IMPLEMENTED)

1. Publisher → MQTT NAVIGATE_TO_POSE  
2. Gateway → MoveCommandHandler.handle  
3. alt reject: NOT_LOCALIZED | NAV2_UNAVAILABLE | BUSY  
4. command_ack accepted  
5. send_goal → NavigateToPose accepted  
6. BT: loop ComputePath + FollowPath  
7. Twist → (opt gate) → ESP32  
8. on_result SUCCEEDED → command_result SUCCEEDED  

## SQ02 Obstacle (EXTERNAL + BT CONFIG)

scan→costmap→RPP/CM affect velocity→BT recovery replan→continue **or** ABORT→FAILED.

## SQ03 Cancel/Fail/LocLoss

- CANCEL → cancel_goal → CANCELED (**IMPLEMENTED**)  
- Timeout/ABORT → FAILED (**IMPLEMENTED**)  
- Legacy mid-run loc LOST telemetry only, **no auto-cancel** (**PARTIAL**)  
- Active/Semantic: authority_ok false → gate zeros (**IMPLEMENTED**)

---

# Part E — FE-11 implemented design

## Ownership

Navigation compiles graph/policy; Fleet `TrafficState` (via `SegmentedTrafficCoordinator` actor) owns runtime reservations; BuildingBlocks defines MQTT; robot clients propose/execute; gate enforces.

## Modes

| Mode | Path source | Resources | Robot client |
|---|---|---|---|
| Shadow | V1 RouteGrant + observe | whole-route graph resources | legacy typical |
| Active | RoutePlanner segments | graph TrafficResource ids / edge slices | TrafficClient |
| Semantic | Nav2 /plan → traffic_plan | zone:* + cell:* (horizon) | SemanticTrafficClient |

## Conflict algorithm (TrafficState)

1. Collect wanted resource ids.  
2. `CanAcquire` — capacity/holders.  
3. `WouldCreateWaitForCycle` — reject DEADLOCK_RISK.  
4. Grant Occupy + authority event **or** Enqueue wait.  
5. On free: `PromoteWaiters` by EffectivePriority = Priority + waited*AgingRate.  
6. Semantic release: `ReportVerifiedExit` fail-closed physical clear.  
7. Offline: Quarantine keep occupancy; MarkOnline clears OFFLINE.  
8. Authority TTL 30s + renew 1.5s; gate max age 0.3s.  
9. **No** separate deadlock recovery planner.  
10. Dual-robot Gazebo PASS **not** verified.

## MQTT actual names

NAVIGATE_TO_POSE, EXTEND_AUTHORITY, RENEW_AUTHORITY, REVOKE_AUTHORITY, CANCEL  
Uplink: traffic_plan, traffic_progress (+ clearedResourceIds), authority_state  
No MQTT types named GRANT/WAIT/HOLD/RELEASE.

---

# Part F — FE-11 key class specifications

| Class | Key operations / fields |
|---|---|
| TrafficCoordinatorMode | Shadow, Active, Semantic |
| TrafficOptions | Mode; AuthorityTtlSec=30; AgingRate=0.1; SemanticHorizonMeters=4; SemanticCellSizeMeters=0.5 |
| ITrafficCoordinator | TryAcquireRouteGrant(...); ReleaseGrant; TakeReadyNavigates |
| ISegmentedTrafficCoordinator | BindGraphAsync; BindSemanticPolicyAsync; AcquireSemanticPlanAsync; AcquireAtomicAsync; ExtendAtomicAsync; AcquireRouteAsync; AdvanceRouteAsync; ReportVerifiedExitAsync; RenewAllActiveAuthoritiesAsync; MarkOfflineAsync; MarkOnlineAsync; CancelRequestAsync; … |
| SegmentedTrafficCoordinator | Channel actor wrapping TrafficState |
| TrafficState | AcquireSemanticPlan; AcquireAtomic; ExtendAtomic; CanAcquire; WouldCreateWaitForCycle; PromoteWaiters; Quarantine; ReportVerifiedExit; Occupy/ReleaseResource |
| SemanticReservation | CollectResources; SampleFootprintCells; IsPhysicallyClearOfResources; TryLoadFromDirectory |
| RoutePlanner | Plan; SegmentSafeStops |
| TrafficAuthorityPublisher | TrafficEvent → MQTT authority commands |
| TrafficProgressIngress | HandlePlanProposeAsync; HandleProgressAsync |
| AuthorityPayload | AuthorityId, Epoch, Seq, ResourceIds, PlanRevision, SemanticMapFingerprint?, ExpiresAt, PathHash, SegmentEdgeIds, Maneuvers? |
| TrafficPlanProposeMessage | SemanticMapFingerprint, PlanRevision, Poses[], Goal? |
| TrafficClient | Active FSM; start_navigate; extend/renew/revoke |
| SemanticTrafficClient | on_plan; on_authority; tick; publish_cleared_resources |
| AuthorityStore | accept; clear_active |
| CmdVelAuthorityGate | permission enforcement |

Relationships: SegmentedTrafficCoordinator *-- TrafficState; realizes interface; TrafficState ..> SemanticReservation; --> CompiledTrafficGraph when Active; Publisher depends MQTT; Clients ..> Gate via topic.

---

# Part G — FE-11 exact sequence flows

## SQ01 Authorize + Move (Semantic) — IMPLEMENTED

1. NAVIGATE issued (job)  
2. Nav2 `/plan` → SemanticTrafficClient.on_plan → MQTT traffic_plan  
3. Ingress → AcquireSemanticPlanAsync → TrafficState  
4. alt Grant → Publisher EXTEND/Authority → client authority_ok True → Gate forwards → motion  
5. alt Wait → Enqueue; no authority_ok  

Active: AcquireRoute → NAVIGATE+Authority → FollowPath → STOPPED_AWAITING → AdvanceRoute → EXTEND.

## SQ02 Two-robot contention — CODE/UNIT IMPLEMENTED; LIVE PASS NOT VERIFIED

RobotA grant → RobotB CanAcquire fail → wait → A ReportVerifiedExit → PromoteWaiters → B grant.  
Annotate diagrams: unit-tested; Gazebo dual FAIL/NOT_RUN.

## SQ03 Replan — IMPLEMENTED

New planRevision → AcquireSemanticPlan → occupancy reconcile (RevokeAuthorityKeepOccupancy / release outside) → new grant → gate.

## SQ04 Offline / loc loss — IMPLEMENTED (segmented)

HB timeout → MarkOffline → Quarantine keep occupancy → motion blocked → MarkOnline on fresh HB (OFFLINE only).

## SQ05 Cancel/fail — IMPLEMENTED APIs

CancelRequest/CompleteRoute/Quarantine CANCEL_WHILE_OCCUPIED; release only with clearance paths; promote waiters after free.

---

# Part H — Shared contracts, topics, configuration

**Topics:** `{prefix}/robots/{code}/command|command_ack|command_result|telemetry|heartbeat|traffic_plan|traffic_progress|authority_state`  
**prefix default:** `warotrans/v1`  
**ROS:** `/plan`, `/cmd_vel_safe`, `/cmd_vel`, `/traffic/authority_ok`, `/scan`, actions NavigateToPose / FollowPath  

**Config:** Host Active; Simulation Semantic; TrafficOptions code Shadow; AuthorityTtl 30; renew 1.5; gate age 0.3; default planner Navfn; LaneAware overlay optional.

**State:** Traffic in-memory; maps in PostgreSQL; Nav2 runtime memory.

---

# Part I — Implementation and test status

| Item | Status |
|---|---|
| FE-06 NavigateToPose path | IMPLEMENTED |
| FE-06 dynamic OA | EXTERNAL Nav2; custom BT |
| FE-06 ultrasonic OA | NOT IMPLEMENTED |
| FE-06 legacy loc-loss cancel | PARTIAL |
| FE-11 Shadow/Active/Semantic | IMPLEMENTED |
| FE-11 conflict/wait/promote/quarantine/deadlock-reject | IMPLEMENTED + unit tests |
| FE-11 deadlock recovery planner | NOT IMPLEMENTED |
| Dual-robot Gazebo PASS | NOT VERIFIED (FAIL/NOT_RUN docs) |

Tests: `backend/tests/.../Fleet/Traffic/*`; `warotrans_fleet/test/*`.  
Docs: `docs/audits/autonomous_gazebo_acceptance/DUAL_ROBOT_RESULTS.md`, STAGE3 acceptance.

---

# Part J — Exact UML drawing instructions

1. **Separate** FE-06 and FE-11 class diagrams.  
2. Mark Nav2 nodes «framework».  
3. Arrow direction: dependent → required.  
4. Orthogonal lines.  
5. Sequence: use actual MQTT/ROS names above.  
6. FE-11: pick **one primary mode** per sequence sheet; footnote others.  
7. SQ02 must include note: live dual PASS unverified.  
8. Do not invent GRANT/WAIT MQTT types.  
9. Do not show TrafficState as DB entity.  
10. Gate is association via topic, not C#↔Python inheritance.

PlantUML starters: see `12_UML_DIAGRAM_BLUEPRINTS.md`.

---

# Part K — Evidence mapping and uncertainties

| Claim | Evidence |
|---|---|
| NavigateToPose client | `nav2_navigator.py` Nav2ActionNavigator |
| Command DTOs | `RobotCommandMessage.cs` |
| Modes/TTL | `TrafficOptions.cs` |
| Acquire APIs | `ISegmentedTrafficCoordinator.cs` |
| Semantic resources | `SemanticReservation.CollectResources` |
| Gate fail-closed | `cmd_vel_authority_gate.py` should_forward |
| LaneAware API | `lane_aware_navfn.hpp` |
| Dual FAIL | DUAL_ROBOT_RESULTS.md |

**Uncertainties:** Whether production deploys Active vs Semantic; whether bringup always enables authority gate; physical robot LaneAware overlay; exact Quarantine revoke exceptions per reason—confirm against `TrafficState.Quarantine` when drawing fine-grained SQ04.

**Can draw accurately now:** FE-06 class+SQ01; FE-06 SQ02 as framework; FE-11 class+SQ01; FE-11 SQ02–05 as **code-level** sequences with honesty notes.  
**Cannot claim:** verified dual-robot warehouse PASS; custom OA engine; RouteGraph retirement; ultrasonic costmap OA.

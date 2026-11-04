# 05 — FE-11 Class Inventory

---

## C# — Fleet Traffic

### `TrafficCoordinatorMode` / `TrafficOptions`
- **NS:** `WaroTrans.Fleet.Traffic`
- **File:** `backend/src/Modules/Fleet/Traffic/TrafficOptions.cs`
- **Enum:** Shadow=0, Active=1, Semantic=2
- **Key attrs:** Mode (default Shadow), AuthorityTtlSec=30, AuthorityRenewIntervalSec=1.5, AgingRate=0.1, SemanticHorizonMeters=4.0, SemanticCellSizeMeters=0.5, LocalizationMarginMeters=0.05, PoseMaxAgeSec=5.0

### `ITrafficCoordinator` / `TrafficCoordinator` (V1 Shadow dispatch)
- **Files:** `ITrafficCoordinator.cs`, `TrafficCoordinator.cs`
- **Ops:**
  - `TryAcquireRouteGrant(robotId, mapVersionId, graph, startNodeId, goalNodeId, jobStepId, pendingNavigate?) → RouteGrantResult`
  - `ReleaseGrant(robotId)` / `ReleaseByJobStep` / `ReleaseAllForOfflineRobot`
  - `TakeReadyNavigates() → IReadOnlyList<ReadyNavigateGrant>`
- **Private concepts:** ResourcesCovering, CanAcquireLocked, PromoteWaitersLocked (FIFO)
- **No:** wait-for cycle, quarantine, verified exit

### `ISegmentedTrafficCoordinator` / `SegmentedTrafficCoordinator`
- **Files:** `ISegmentedTrafficCoordinator.cs`, `SegmentedTrafficCoordinator.cs`
- **Pattern:** Channel single-writer actor over `TrafficState`
- **Key ops (async façade):** BindGraphAsync, BindSemanticPolicyAsync, AcquireSemanticPlanAsync, AcquireAtomicAsync, ExtendAtomicAsync, AcquireRouteAsync, AdvanceRouteAsync, ReportStoppedAwaitingAsync, ReportVerifiedExitAsync, RenewAuthorityAsync, RenewAllActiveAuthoritiesAsync, MarkOfflineAsync, MarkOnlineAsync, CancelRequestAsync, ReconcileRobotAsync, …

### `TrafficState`
- **File:** `TrafficState.cs`
- **Responsibility:** Occupancy holders, wait queues, authority epochs/seqs, quarantine, semantic/graph bind
- **Key ops:** AcquireSemanticPlan, AcquireAtomic, AcquireRoute, ExtendAtomic, AdvanceRoute, ReportVerifiedExit, PromoteWaiters (private), CanAcquire, WouldCreateWaitForCycle, Quarantine, RevokeAuthorityKeepOccupancy, Occupy/ReleaseResource, IsPhysicallyClear, EffectivePriority
- **Storage:** in-memory dictionaries (not EF entities)

### `SemanticReservation` (+ records)
- **File:** `SemanticReservation.cs`
- **Records:** SemanticTrafficPolicy, SemanticZonePoly, SemanticPlanPose, SemanticPlanProposeRequest
- **Static ops:** CollectResources, SampleFootprintCells, FootprintHitsZone, PointInRing, IsPhysicallyClearOfResources, TryLoadFromDirectory

### `RoutePlanner`
- **File:** `RoutePlanner.cs`
- **Ops:** Plan(...), SegmentSafeStops(...) → edge slices + ResourcesCovering + maneuvers

### `ManeuverStepBuilder`
- **File:** `ManeuverStepBuilder.cs`
- **Ops:** Build(graph, edgeIds), ToPayload

### `TrafficAuthorityPublisher` : BackgroundService
- **File:** `TrafficAuthorityPublisher.cs`
- **Responsibility:** TrafficEvent → MQTT NAVIGATE_TO_POSE (+Authority), EXTEND_AUTHORITY, RENEW_AUTHORITY, REVOKE_AUTHORITY
- **Modes:** publishes when Mode ∈ {Active, Semantic}

### `TrafficAuthorityRenewHostedService`
- Periodic `RenewAllActiveAuthoritiesAsync` when Active/Semantic

### `TrafficProgressIngress`
- HandlePlanProposeAsync, HandleProgressAsync, HandleAuthorityStateAsync

### `RobotMqttIngress` : `IRobotMqttIngress`
- Delegates traffic_* topics to ingress; heartbeats/telemetry/acks elsewhere

### `SemanticPolicyBootstrapHostedService`
- Binds semantic policy at startup if Mode=Semantic

### Navigation consumed types
- `CompiledTrafficGraph`, `TrafficResource`, `TrafficGraphCompiler` — Navigation module; Fleet ProjectReferences Navigation

---

## C# — MQTT DTOs (BuildingBlocks)

`RobotCommandTypes`: NAVIGATE_TO_POSE, CANCEL, EXTEND_AUTHORITY, RENEW_AUTHORITY, REVOKE_AUTHORITY  

Payloads: AuthorityPayload, ExtendAuthorityPayload, RenewAuthorityPayload, RevokeAuthorityPayload, TrafficProgressMessage (+ ClearedResourceIds), TrafficPlanProposeMessage, AuthorityStateMessage  

Progress events: STARTED, EDGE_ENTERED, EDGE_EXITED, SAFE_STOP_REACHED, STOPPED_AWAITING_AUTHORITY, FAULT (+ robot RESOURCES_CLEARED usage)

**Note:** No MQTT literals named GRANT/WAIT/HOLD/RELEASE.

---

## Python — warotrans_fleet

### `TrafficClient`
- Active segment FSM: IDLE→VALIDATING→EXECUTING→STOPPED_AWAITING→…  
- Ops: start_navigate, extend_authority, renew_authority, revoke_authority, cancel_command, authority_valid

### `SemanticTrafficClient`
- **File:** `semantic_traffic_client.py`
- **Attrs/types:** SemanticGrant
- **Ops:** on_plan, on_authority_payload, on_renew, on_revoke, tick, resources_cleared_at, publish_cleared_resources
- Sets authority_ok for gate

### `AuthorityStore` / `Authority` / `ManeuverStep`
- accept/clear_active; epoch/seq/expiry/pathHash validation; persistence for authority_state

### `CmdVelAuthorityGate` / `AuthorityGateLogic`
- FE-11 enforcement (see FE-06 inventory)

### `PathPolicyValidator`
- Stage-2 defense; cancel illegal plans

### `SafetySupervisor`
- Active: publishes authority_ok ~20 Hz; localization pause

---

## Relationships (meaningful)

| Source | Target | Type | Notes |
|---|---|---|---|
| SegmentedTrafficCoordinator | TrafficState | composition (owned by actor) | state mutated only via actor |
| SegmentedTrafficCoordinator | ISegmentedTrafficCoordinator | realization | |
| TrafficCoordinator | ITrafficCoordinator | realization | |
| TrafficAuthorityPublisher | IMqttRobotCommandPublisher | dependency | |
| TrafficProgressIngress | ISegmentedTrafficCoordinator | dependency | |
| TrafficState | SemanticReservation | dependency (static helpers) | |
| TrafficState | CompiledTrafficGraph | association when bound | |
| SemanticTrafficClient | CmdVelAuthorityGate | runtime topic association | authority_ok |
| TrafficClient | AuthorityStore | association | |
| TrafficClient | Nav2SegmentExecutor | association | |

Do **not** draw composition from DI constructor alone without ownership evidence.

# 13 — SDD Class Specifications

## FE-06 significant classes

| Class | Responsibility | Attributes | Operations | Relationships |
|---|---|---|---|---|
| RobotCommandMessage | MQTT navigate/command envelope | SchemaVersion; MessageId; CommandId; RobotCode; Type; IssuedAt; Payload | — | associates NavigateToPosePayload |
| NavigateToPosePayload | Goal pose for autonomous move | FrameId; X; Y; Yaw; Route?; Authority? | — | used by RobotCommandMessage |
| MqttRobotCommandPublisher | Publishes robot commands | — | PublishAsync(RobotCommandMessage) | depends on MQTT client |
| RobotGatewayNode | ROS gateway node for MQTT↔Nav2 | traffic_mode; navigate_action | MQTT handlers; telemetry timers | uses MoveCommandHandler |
| MoveCommandHandler | Accepts navigate/cancel; drives Nav2 | session state; timeouts | handle(...); tick(); request_cancel() | depends on NavigatorPort |
| Nav2ActionNavigator | NavigateToPose action client | ActionClient | is_ready(); send_goal(); cancel_goal() | realizes NavigatorPort |
| NavGoal / NavResult | Goal/result DTOs | x,y,yaw,frame; status,error | — | used by navigator |
| LaneAwareNavfn | Lane-aware global planner plugin | segs_; corridor_margin_; lane_prefer_factor_; lethal_cost_ | createPlan(...); moveAllowed(...) | inherits nav2_core::GlobalPlanner |
| CmdVelAuthorityGate | Forwards cmd_vel only with fresh authority | topics; max_age | decide via AuthorityGateLogic | composition AuthorityGateLogic |
| Esp32BridgeNode | Converts Twist to MCU serial | serial config | cmd_vel callback | consumes /cmd_vel |

## FE-11 significant classes

| Class | Responsibility | Attributes | Operations | Relationships |
|---|---|---|---|---|
| TrafficOptions | Traffic coordinator configuration | Mode; AuthorityTtlSec; AgingRate; SemanticHorizonMeters; … | ResolveStationMeta() | uses TrafficCoordinatorMode |
| TrafficCoordinator | V1 whole-route grant dispatcher (Shadow) | holders/queues (internal) | TryAcquireRouteGrant; ReleaseGrant; TakeReadyNavigates | realizes ITrafficCoordinator |
| SegmentedTrafficCoordinator | Actor façade for segmented/semantic traffic | Epoch; Channel | BindGraphAsync; AcquireSemanticPlanAsync; AcquireRouteAsync; AdvanceRouteAsync; ReportVerifiedExitAsync; MarkOfflineAsync; … | realizes ISegmentedTrafficCoordinator; composes TrafficState |
| TrafficState | In-memory reservation/authority machine | robots; holders; queues; graph/semantic binds | AcquireSemanticPlan; AcquireAtomic; ExtendAtomic; PromoteWaiters; CanAcquire; WouldCreateWaitForCycle; Quarantine; ReportVerifiedExit | depends on SemanticReservation; associates CompiledTrafficGraph |
| SemanticReservation | Semantic zone/cell resource helpers | — | CollectResources; SampleFootprintCells; IsPhysicallyClearOfResources; TryLoadFromDirectory | used by TrafficState |
| RoutePlanner | Active Mode route/segment planning | — | Plan; SegmentSafeStops | depends on CompiledTrafficGraph |
| TrafficAuthorityPublisher | Publishes authority MQTT commands | activeCommandByRobot | HandleAsync(TrafficEvent) | depends on IMqttRobotCommandPublisher |
| TrafficProgressIngress | Handles traffic_plan/progress/authority_state | — | HandlePlanProposeAsync; HandleProgressAsync | depends on ISegmentedTrafficCoordinator |
| AuthorityPayload | Motion authority DTO | AuthorityId; Epoch; Seq; ResourceIds; PlanRevision; ExpiresAt; PathHash; … | — | carried in MQTT payloads |
| TrafficClient | Active Mode robot authority FSM | AuthorityStore; executor | start_navigate; extend/renew/revoke | associates AuthorityStore, Nav2SegmentExecutor |
| SemanticTrafficClient | Semantic plan propose + grant client | SemanticGrant; planRevision | on_plan; on_authority; tick; publish_cleared_resources | runtime assoc. gate via authority_ok |
| AuthorityStore | Validates/stores active authority | Authority | accept; clear_active | used by TrafficClient |

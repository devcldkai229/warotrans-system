# 02 — FE-06 Class Inventory

Only classes with FE-06 responsibility. Status: IMPLEMENTED unless noted.

---

## Backend (C#)

### `RobotCommandMessage` — `WaroTrans.BuildingBlocks.Mqtt.Messages`
- **File:** `backend/src/WaroTrans.BuildingBlocks/Mqtt/Messages/RobotCommandMessage.cs`
- **Attributes:** SchemaVersion, MessageId, CommandId, RobotCode, Type, IssuedAt, JobAssignmentId?, JobStepId?, Payload
- **Related types:** `RobotCommandTypes.NavigateToPose`, `NavigateToPosePayload { FrameId, X, Y, Yaw, Route?, Authority? }`
- **Responsibility:** Downlink navigate envelope

### `MqttRobotCommandPublisher` — `WaroTrans.BuildingBlocks.Mqtt`
- **File:** `.../MqttRobotCommandPublisher.cs`
- **Operation:** `PublishAsync(RobotCommandMessage)`
- **Responsibility:** Publish to `RobotMqttTopics.Command`

### `RobotMqttTopics`
- **File:** `.../RobotMqttTopics.cs`
- **Constants:** Command, CommandAck, CommandResult, Telemetry, Heartbeat, …

---

## Robot fleet (Python)

### `RobotGatewayNode`
- **File:** `ros2_ws/src/warotrans_fleet/warotrans_fleet/robot_gateway_node.py`
- **Base:** `rclpy.node.Node`
- **Key params:** `navigate_action="navigate_to_pose"`, `traffic_mode`
- **Key ops:** MQTT inbox drain, Nav2 setup, telemetry/heartbeat timers
- **Calls:** CommandRouter, MoveCommandHandler, TrafficClient/SemanticTrafficClient

### `MoveCommandHandler`
- **File:** `.../move_command_handler.py`
- **Ops:** `handle(envelope, session) → AckDecision`; `tick`; `request_cancel`
- **Guards:** NOT_LOCALIZED, NAV2_UNAVAILABLE, BUSY, timeout → FAILED
- **Branches:** legacy send_goal vs active TrafficClient vs semantic

### `Nav2ActionNavigator`
- **File:** `.../nav2_navigator.py`
- **Implements:** NavigatorPort protocol
- **Ops:**
  - `is_ready() → bool`
  - `send_goal(goal: NavGoal, ticket: GoalTicket, callbacks: GoalCallbacks) → None`
  - `cancel_goal(...)`
- **Uses:** `ActionClient(NavigateToPose, action_name)`
- **DTOs:** `NavGoal`, `NavResult`, `NavFeedback`, `GoalCallbacks` in `navigator.py`

### `Nav2SegmentExecutor` (Active Mode motion)
- **File:** `.../nav2_segment_executor.py`
- **Ops:** `execute_maneuvers`, `follow_path`, `cancel`, FollowPath/Spin actions
- **Status:** IMPLEMENTED (FE-11 Active motion; still Nav2 controllers)

### `CmdVelAuthorityGate` / `AuthorityGateLogic`
- **File:** `.../cmd_vel_authority_gate.py`
- **Functions:** `should_forward(authority_ok, age, max_age=0.3) → bool`
- **Ops:** `AuthorityGateLogic.on_authority_ok`, `decide(now) → GateDecision`
- **Topics:** `/cmd_vel_safe` → `/cmd_vel` gated by `/traffic/authority_ok`
- **FE role:** FE-11 enforcement boundary affecting FE-06 motion output

### `LocalizationHysteresis`
- **File:** `.../localization_hysteresis.py`
- **Responsibility:** Latch localization good/stale for telemetry

### `PathPolicyValidator`
- **File:** `.../path_policy_validator.py`
- **Base:** Node
- **Role:** FE-11 defense-in-depth on `/plan` (not OA)

---

## C++ planner

### `warotrans_lane_planner::LaneAwareNavfn`
- **Files:** `lane_aware_navfn.hpp`, `lane_aware_navfn.cpp`
- **Inherits:** `nav2_core::GlobalPlanner`
- **Public:** `configure`, `cleanup`, `activate`, `deactivate`, `createPlan(start, goal, cancel_checker) → Path`
- **Private:** `loadLanes`, `moveAllowed`, `onLaneCorridor`, `worldToMap`, `mapToWorld`
- **Fields:** `segs_`, `corridor_margin_`, `lane_prefer_factor_`, `lethal_cost_`, `start_goal_lethal_cost_`, `costmap_`
- **Status:** IMPLEMENTED; activation CONFIGURATION-DEPENDENT

---

## Hardware / sensors

### `Esp32BridgeNode`
- **File:** `warotrans_hardware/esp32_bridge_node.py`
- **Ops:** subscribe `/cmd_vel` → serial velocity command

### `WheelOdomNode`
- **File:** `warotrans_hardware/wheel_odom_node.py`
- **Ops:** `/wheel_ticks` → `/odom`

### Sensor nodes
- `ultrasonic_node`, `bno055_node` — custom; ultrasonic **not** in costmap (PARTIAL)

---

## EXTERNAL FRAMEWORK (document as components, not WaroTrans classes)

`bt_navigator`, `planner_server`, `controller_server`, `nav2_navfn_planner::NavfnPlanner`, `RegulatedPurePursuitController`, `ObstacleLayer`, `InflationLayer`, `collision_monitor`, `velocity_smoother`, `amcl`, `map_server`, `rplidar_composition`

---

## Recommended FE-06 class diagram set

**Include:** RobotGatewayNode, MoveCommandHandler, Nav2ActionNavigator, LaneAwareNavfn, CmdVelAuthorityGate (boundary), Esp32BridgeNode, RobotCommandMessage/NavigateToPosePayload, NavGoal/NavResult.

**Exclude / stereotype External:** full Nav2 node graph as one «framework» package.
**Exclude:** TrafficState, SemanticReservation (FE-11).

# 03 — FE-06 Sequence Traces

Semantics: sync = direct call/action response wait; async = MQTT/ROS action feedback/result.

---

## FE-06-SQ01 — Autonomous NavigateToPose Execution (legacy)

**Status:** IMPLEMENTED

| Step | From | To | Message | I/O | Sync | Evidence |
|---|---|---|---|---|---|---|
| 1 | Backend publisher | MQTT | `NAVIGATE_TO_POSE` / `RobotCommandMessage` | NavigateToPosePayload | async | MqttRobotCommandPublisher |
| 2 | MQTT | RobotGatewayNode | subscribe command topic | envelope | async | robot_gateway_node |
| 3 | Gateway | MoveCommandHandler | `handle(envelope, session)` | AckDecision | sync | move_command_handler |
| 4 | Handler | MQTT (via gateway) | `command_ack` accepted | ack | async | build_command_ack |
| 5 | Handler | Nav2ActionNavigator | `send_goal(NavGoal,…)` | PoseStamped goal | async start | nav2_navigator |
| 6 | Navigator | bt_navigator | NavigateToPose action goal | accepted? | async | EXTERNAL |
| 7 | bt_navigator | planner_server | ComputePathToPose (BT) | Path | sync-in-BT | EXTERNAL / LaneAware if overlay |
| 8 | bt_navigator | controller_server | FollowPath | Twist stream | loop | EXTERNAL RPP |
| 9 | controller → smoother → CM | `/cmd_vel` (or `_safe`) | Twist | async | EXTERNAL |
| 10 | (opt) AuthorityGate | `/cmd_vel` | forward if authority_ok | CONFIG | cmd_vel_authority_gate |
| 11 | Esp32BridgeNode | MCU | serial velocity | async | esp32_bridge_node |
| 12 | Nav2 | Navigator callbacks | feedback / result SUCCEEDED | NavFeedback/NavResult | async | nav2_navigator |
| 13 | Handler/Gateway | MQTT | `command_result` SUCCEEDED + telemetry | result | async | command_contract builders |

**Guards (alt):** NOT_LOCALIZED → ack reject; NAV2_UNAVAILABLE → reject; BUSY → reject; goal rejected → FAILED.

---

## FE-06-SQ02 — Obstacle Encounter and Replanning

**Status:** Mostly EXTERNAL_FRAMEWORK; custom BT XML configures recoveries. Dynamic OA success not claimed as custom algorithm.

| Step | From | To | Behavior | Status |
|---|---|---|---|---|
| 1 | LiDAR | `/scan` | ObstacleLayer updates costmaps | EXTERNAL |
| 2 | InflationLayer | costmap | inflate lethal/cost | EXTERNAL |
| 3 | RPP | controller | collision detection may fail FollowPath | EXTERNAL |
| 4 | Collision Monitor | cmd_vel | approach scale/stop | EXTERNAL / CONFIG |
| 5 | BT RecoveryNode | planner/controller | clear local → Wait → ComputePath again | IMPLEMENTED BT config |
| 6 | Outer recovery | behaviors | BackUp / Spin / Wait (retries) | EXTERNAL behaviors + BT |
| 7a | Success | continue FollowPath | IMPLEMENTED framework |
| 7b | Exhaust retries | action ABORT | → MQTT FAILED `ERROR_NAVIGATION_FAILED` | IMPLEMENTED uplink |

**Not in this sequence:** ultrasonic costmap update (**NOT IMPLEMENTED**). PathPolicyValidator cancel is FE-11 semantic policy, not OA.

---

## FE-06-SQ03 — Failure, Cancellation, Localization Loss

### Cancel (IMPLEMENTED)

| Step | Flow |
|---|---|
| 1 | Backend MQTT `CANCEL` + CancelCommandPayload |
| 2 | CancelCommandHandler / MoveCommandHandler.request_cancel |
| 3 | Nav2ActionNavigator.cancel_goal |
| 4 | MQTT `command_result` CANCELED |

### Timeout (IMPLEMENTED)

Handler tick → cancel → FAILED `ERROR_NAVIGATION_TIMEOUT`.

### Nav2 abort (IMPLEMENTED)

Result callback → FAILED `ERROR_NAVIGATION_FAILED`.

### Localization loss mid-run (PARTIAL)

| Mode | Behavior | Status |
|---|---|---|
| legacy | Telemetry LOST via LocalizationHysteresis; **no auto-cancel** of NavigateToPose in handler | PARTIAL |
| active | SafetySupervisor → authority_ok false → gate zeros cmd_vel; may FAULT LOCALIZATION_LOST | IMPLEMENTED |
| semantic_active | Grant/authority path similarly fail-closed via gate | IMPLEMENTED |

### Accept-time not localized (IMPLEMENTED)

Ack `NOT_LOCALIZED`.

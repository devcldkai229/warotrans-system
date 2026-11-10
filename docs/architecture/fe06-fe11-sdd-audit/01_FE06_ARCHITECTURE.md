# 01 — FE-06 Architecture

## End-to-end architecture

```text
Backend (Fleet / Workflow)
  └─ MQTT NAVIGATE_TO_POSE (RobotCommandMessage)
       └─ RobotGatewayNode
            └─ MoveCommandHandler
                 ├─ [legacy] Nav2ActionNavigator → NavigateToPose action
                 ├─ [active] TrafficClient → Nav2SegmentExecutor → FollowPath/Spin
                 └─ [semantic_active] NavigateToPose + SemanticTrafficClient (grant-gated)
                      └─ Nav2 BT / planner / controller / costmaps
                           └─ velocity_smoother → collision_monitor
                                └─ [/cmd_vel_safe → CmdVelAuthorityGate] → /cmd_vel
                                     └─ Esp32BridgeNode → serial motors
```

Uplink: `command_ack`, `command_result`, `telemetry`, `heartbeat` (+ traffic topics when FE-11 modes on).

---

## Who initiates navigation

| Initiator | Mechanism | Evidence |
|---|---|---|
| Job execution / fleet traffic grant | MQTT `NAVIGATE_TO_POSE` | `MqttRobotCommandPublisher`, `TrafficAuthorityPublisher` |
| Manual / tools | Same MQTT command | Gateway accepts any valid envelope |

Target representation: `NavigateToPosePayload { FrameId, X, Y, Yaw, Route?, Authority? }` in map frame.

---

## Planner / controller (verified configs)

| Profile | Planner | Controller | File |
|---|---|---|---|
| Default robot | `nav2_navfn_planner::NavfnPlanner` (GridBased) | RegulatedPurePursuitController FollowPath (+ Reverse) | `warotrans_navigation/config/nav2_params.yaml` |
| Lane-aware overlay | `warotrans_lane_planner::LaneAwareNavfn` | same RPP family | `nav2_params_lane_aware.yaml` |
| Simulation overlay | typically LaneAware + tuned RPP/CM | faster vel / softer CM | `warotrans_simulation/config/nav2_params_sim.yaml` |

**BT (default):** `navigate_to_pose_w_replanning_resilient.xml` — RateController replan ~0.33 Hz; FollowPath fail → clear local → wait → replan; outer recoveries clear/BackUp/Spin/Wait.

---

## Global planning (custom vs framework)

| Concern | Owner | Hard/soft |
|---|---|---|
| Dijkstra/A* on costmap (default) | Nav2 NavfnPlanner | EXTERNAL |
| Lane corridor preference | LaneAwareNavfn step cost `lane_prefer_factor_` | SOFT |
| ONE_WAY reverse prune | LaneAwareNavfn `moveAllowed` | HARD |
| LETHAL / NO_INFO cells | LaneAware / costmap | HARD |
| KEEP_OUT filter layer | Nav2 KeepoutFilter when enabled | CONFIG-DEPENDENT |
| SPEED mask | Speed filter when enabled | CONFIG-DEPENDENT |

---

## Obstacle handling (FE-06 truth)

1. LiDAR `/scan` → ObstacleLayer on local + global costmaps.  
2. InflationLayer expands obstacles.  
3. RPP may abort on collision detection along carrot.  
4. Collision Monitor `approach` can scale/stop `cmd_vel_smoothed` → `cmd_vel` (or `cmd_vel_safe`).  
5. BT recoveries replan/clear/backup/spin.  
6. Ultrasonic nodes exist but are **not** wired into Nav2 costmaps → **PARTIAL** vs full low-obstacle claim.  
7. `PathPolicyValidator` cancels illegal semantic plans (FE-11 defense)—**not** dynamic obstacle OA.

---

## Motion execution & feedback

- Legacy: NavigateToPose feedback → gateway telemetry NAVIGATING; result SUCCEEDED/FAILED/CANCELED via MQTT.  
- Localization gate at accept: reject if not `LOCALIZED`.  
- Mid-run TF loss (legacy): telemetry LOST via `LocalizationHysteresis`; **does not auto-cancel** NavigateToPose (**PARTIAL**).  
- Active/Semantic: authority loss zeros cmd_vel via gate (**IMPLEMENTED**).

---

## Status labels for diagrams

- Custom WaroTrans classes: gateway, handlers, navigators, gate, LaneAwareNavfn, ESP32 bridge.  
- EXTERNAL_FRAMEWORK: bt_navigator, planner_server, controller_server, costmap layers, collision_monitor, amcl, rplidar.  
- Do not invent a WaroTrans “ObstacleAvoidanceService” class.

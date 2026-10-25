# Robot runtime audit (Task A)

**Date:** 2026-10-25  
**Branches:** `warotrans/feature/traffic-coordinator`, `warotrans-system/feature/traffic-coordinator`  
**Tag:** `pre-traffic-active`  
**Mode:** inspection-only (no cmd_vel, no actions, no service restart, no flash)

## Live Pi SSH

| Check | Result |
|-------|--------|
| `ssh waro@warotrans.local` | **BLOCKED** — `Permission denied (publickey,password)` from this agent host |
| ROS distro on Pi | **CHƯA XÁC NHẬN** (this session) — STATUS says Jazzy VERIFIED historically |
| `nav2_route` installed on Pi | **CHƯA XÁC NHẬN** |
| CPU / RAM / pidstat | **CHƯA XÁC NHẬN** — requires SSH |
| Heartbeat on MQTT | **CHƯA XÁC NHẬN** |
| Live TF / topic hz | **CHƯA XÁC NHẬN** |

Operator can re-run the inspection commands in [ROBOT-INTEGRATION.md](ROBOT-INTEGRATION.md) once SSH keys are available.

## Local code audit (PASS)

| Area | Finding |
|------|---------|
| Gateway | `robot_gateway_node.py` MQTT↔ROS; MOVE/CANCEL via `command_stack` |
| Route grant (V1) | `route_enforcer.py`: graphHash, adjust_edges, ComputeRoute match, corridor + MQTT grant-loss |
| Nav2 Route Server | Opt-in `route_graph:=`; BT `navigate_to_pose_route.xml`; config `route_server.yaml` |
| cmd_vel pipeline | Default ON: controller → smoother → collision_monitor → `/cmd_vel` → esp32_bridge |
| Doc conflict | `docs/interfaces.md` Phase 0 freeze omits smoother; launch defaults pipeline ON — **reported, not resolved** |
| Motor watchdog | ESP32 `command_watchdog_ms=300` in source; Phase 7.5 wheels-lifted verify still open in STATUS |
| Deploy / rollback | `tools/deploy.sh` creates `~/warotrans_backups/ros2_src_*.tgz`; `tools/rollback_source.sh` restores |
| Authority fields | Not parsed on robot yet (ADR 0009 reserved) — this integration adds them |

## Frame contract (from rules / code)

```text
map → odom → base_footprint → base_link → laser
```

One publisher per TF edge. Navigate goals use `frameId=map`.

## Installed interfaces (from source / docs — not live Pi)

| Interface | Expected |
|-----------|----------|
| ROS 2 | Jazzy |
| FollowPath | `nav2_msgs/action/FollowPath` |
| ComputeRoute | `nav2_msgs/action/ComputeRoute` (nav2_route) |
| DynamicEdges | `route_server/DynamicEdgesScorer/adjust_edges` |
| cmd_vel | `geometry_msgs/Twist` (not Stamped) |

## Risks

1. Live Pi unreachable from agent → hardware-safe evidence deferred to operator.
2. Enabling `cmd_vel_authority_gate` without approval can zero valid motion if miswired.
3. Active Mode without `nav2_route` on Pi cannot run reservation-gated FollowPath.

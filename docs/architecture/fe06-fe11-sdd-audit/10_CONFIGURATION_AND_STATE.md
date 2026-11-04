# 10 — Configuration and State

## Traffic mode selection (verified)

| Source | Traffic:Mode |
|---|---|
| `TrafficOptions.cs` code default | Shadow |
| `WaroTrans.Host/appsettings.json` | Active |
| `appsettings.Development.json` | Active |
| `appsettings.Simulation.json` | Semantic |

Other verified defaults (`TrafficOptions`): AuthorityTtlSec=30, AuthorityRenewIntervalSec=1.5, AgingRate=0.1, SemanticHorizonMeters=4.0, SemanticCellSizeMeters=0.5, LocalizationMarginMeters=0.05, PoseMaxAgeSec=5.0.

## Robot gateway traffic_mode

| Value | Client |
|---|---|
| `legacy` | NavigateToPose only |
| `active` | TrafficClient + FollowPath |
| `semantic_active` | SemanticTrafficClient + NavigateToPose + plan propose |

## Nav2 (verified highlights)

| Item | Value / path |
|---|---|
| Default planner | NavfnPlanner GridBased — `warotrans_navigation/config/nav2_params.yaml` |
| LaneAware overlay | `warotrans_lane_planner::LaneAwareNavfn` — `nav2_params_lane_aware.yaml` |
| Controllers | RPP FollowPath + FollowPathReverse |
| Footprint | ±0.16×0.13 m (params yaml) |
| Scan topic | `/scan` |
| Collision Monitor | enabled in params; approach; launch-gated pipeline |
| Authority gate launch | `enable_authority_gate` default OFF |
| Sim overlay | `warotrans_simulation/config/nav2_params_sim.yaml` |
| BT default | `navigate_to_pose_w_replanning_resilient.xml` |

## MQTT

- Prefix default `warotrans/v1`
- Topics: command, command_ack, command_result, telemetry, heartbeat, traffic_plan, traffic_progress, authority_state
- Gate ROS: `/cmd_vel_safe`, `/cmd_vel`, `/traffic/authority_ok` (max age 0.3s)

## State storage

| State | Location |
|---|---|
| Traffic occupancy/authority/queues | Backend in-memory TrafficState |
| Robot authority cache | AuthorityStore (memory + optional persist file) |
| Map/endpoints/zones | PostgreSQL NavigationDbContext |
| Operations notifications | MongoDB (not FE-06/11 core) |
| Nav2 costmaps / AMCL | ROS runtime memory |

## Important transitions (segmented)

Tracked → Authorized → Waiting → HoldingService → Quarantined(OFFLINE/LOCALIZATION_LOSS/…) → Online clears OFFLINE only  

Authority expiresAt must be renewed; stale gate → zero Twist.

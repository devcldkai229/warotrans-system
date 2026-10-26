# Architecture audit — Traffic Management (Task A)

**Date:** 2026-10-24  
**Repos:** `warotrans-system` (`feature/traffic-graph`), `warotrans` (`feature/traffic-route-grant`)

## 1. Navigation entities, APIs, geometry

| Item | Location |
|------|----------|
| Entities | `Endpoint`, `Edge`, `Zone`, `EndpointGroup`, `MapVersion` |
| Enums | `EndpointType` WAYPOINT\|CHARGER\|PARK; `ZoneType` KEEP_OUT\|SPEED\|NO_STOP\|SINGLE_OCCUPANCY\|**JUNCTION**; `EdgeDirection` ONE_WAY\|BIDIRECTIONAL; `MapStatus` DRAFT\|PUBLISHED\|ARCHIVED |
| Geometry | GeoJSON Polygon/LineString in world metres (`FrameId`); rules in `rules/05-NAVIGATION-RULES.md` |
| CRUD APIs | `/api/navigation/maps/{id}/(endpoints\|edges\|zones)` |
| Route export | `GET /api/navigation/maps/{id}/route-graph` (commit `7179f72`) |
| Traffic validation | `GET .../traffic-graph/validation`, `GET .../traffic-graph/debug.svg` |

## 2. Routing / graph implementations

| Component | Status |
|-----------|--------|
| `RouteGraphBuilder` | Pure, deterministic topology (snap, T-junction split, KEEP_OUT cut, junction connect, endpoint attach, reachability) |
| `CompiledTrafficGraph` | Immutable wrap: resources, corridors, stoplines, CSR, Dijkstra, occupancy clearance, swept conflict index |
| Persisted TrafficResource/Reservation | **Forbidden** (rules/05) — in-memory only |

## 3. MQTT gateway, command lifecycle, telemetry

| Path | Location |
|------|----------|
| Backend ingress | `MqttSubscriberHostedService` → `RobotMqttIngress` → Fleet handlers |
| Command publish | `MqttRobotCommandPublisher` / `IssueNavigateCommandHandler` |
| Lifecycle | `RobotCommandLifecycleChanged` → `RobotCommandLifecycleJobStepHandler` |
| Robot gateway | `warotrans_fleet/robot_gateway_node.py` + `move_command_handler.py` |
| Contract | `docs/mqtt-robot-contracts.md` (+ optional `route` per ADR 0007) |

## 4. ROS 2 / Nav2

| Item | Evidence |
|------|----------|
| Distro | ROS 2 Jazzy |
| Controller | RegulatedPurePursuit `FollowPath` |
| Route Server | `nav2_route` 1.3.13, `route_server.yaml`, BT `navigate_to_pose_route.xml` (commit `a3163d8`) |
| Footprint | `[[±0.16, ±0.13]]` + padding 0.02 |
| Fetch script | `warotrans_simulation/scripts/fetch_route_graph.sh` |

## 5. MOVE executor / Job orchestration

`JobExecutionEngine.StartMoveAsync` → `IFleetModule.NavigateAsync` → MQTT `NAVIGATE_TO_POSE`.
HUMAN_CONFIRM via Staff App or robot button (`ConfirmationSource`). Physical E2E PASS 2026-10-21.

## 6. Tests / deploy / hardware notes

- Unit: Navigation RouteGraph + Traffic; Workflow JobExecutionEngine; Fleet MQTT.
- Physical: `samples/physical-e2e/`; STATUS.md fleet bridge + MOVE + button PASS.
- Known: outdoor Nav2 stall not claimed; Pi `nav2_route` install **NOT_RUN** in this workstream; no physical motion in traffic work.

## 7. MapVersion / occupancy / footprint

| Map | Notes |
|-----|-------|
| MAP-WHSIM-V002 | Sim warehouse; endpoints + zones; **no Edges drawn in local DB** at audit time |
| MAP-WHREAL-V001 | Small physical E2E (SRC/DST only) |
| warotrans_map3 | YAML in repo; **PGM missing locally** → occupancy validation BLOCKED until import |

Footprint SoT for traffic: `Traffic:Footprint` = 0.32×0.26 + 0.02 (matches Nav2 / chassis). Container overhang out of scope V1.

## Route ownership decision

**Selected:** Backend `CompiledTrafficGraph` SoT → export to Nav2 Route Server →
`ComputeRoute`/`FollowPath` only. No competing free global planner when route mode on.
See [ADR 0007](../adr/0007-traffic-route-ownership.md).

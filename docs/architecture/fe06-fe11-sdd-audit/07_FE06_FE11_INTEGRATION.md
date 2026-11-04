# 07 — FE-06 / FE-11 Integration Boundary

## Responsibility matrix

| Question | Owner | Mechanism |
|---|---|---|
| Who calculates a path? | FE-06 Nav2 (legacy/semantic) or FE-11 Active `RoutePlanner` | Path / segments |
| Who checks lane direction (ONE_WAY)? | FE-06 LaneAwareNavfn + FE-11 PathPolicyValidator + Navigation compile | Hard prune / cancel / graph |
| Who detects multi-robot path conflicts? | FE-11 `TrafficState.CanAcquire` / cycle | Capacity + wait-for |
| Who owns resource reservation? | FE-11 Fleet TrafficState | In-memory |
| Who grants movement permission? | FE-11 coordinator + MQTT authority | TTL-bounded |
| Who enforces authority? | FE-11 CmdVelAuthorityGate | Fail-closed |
| Who stops for collision risk (dynamic obstacle)? | FE-06 Nav2 CM/RPP/costmaps | Independent of grant |
| Who publishes navigation status? | FE-06 gateway telemetry + command_result; FE-11 traffic_progress | MQTT |
| Who decides job/nav completion? | WorkflowExecution + command_result handlers | Backend |
| Planning OK but motion fails? | FE-06 FAILED result; FE-11 may quarantine / keep occupancy | Fail-closed segmented |

## Shared contracts

Topics (prefix `warotrans/v1`):  
`command`, `command_ack`, `command_result`, `telemetry`, `heartbeat`, `traffic_plan`, `traffic_progress`, `authority_state`

Command types: NAVIGATE_TO_POSE, CANCEL, EXTEND_AUTHORITY, RENEW_AUTHORITY, REVOKE_AUTHORITY

ROS topics: `/plan`, `/cmd_vel_safe`, `/cmd_vel`, `/traffic/authority_ok`, `/scan`, NavigateToPose / FollowPath actions

## Coupling rules for UML

- Prefer **Sequence** diagrams for cross-language FE-06↔FE-11 flows.
- Class diagrams: keep FE-06 and FE-11 largely separate; show Gate + AuthorityPayload as shared boundary types.
- Do not draw Backend TrafficState → Nav2 class inheritance.

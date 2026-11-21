# Robot MQTT contracts (shared SoT)

Backend ↔ Robot transport. Topics and payloads for WaroTrans Host and robot gateway.  
Protocol decision: [adr/0005-fleet-mqtt-command-protocol.md](adr/0005-fleet-mqtt-command-protocol.md).

## Topics

```text
warotrans/v1/robots/{robotCode}/heartbeat              # robot → backend (QoS0)
warotrans/v1/robots/{robotCode}/telemetry              # robot → backend (QoS0)
warotrans/v1/robots/{robotCode}/command                # backend → robot (QoS1)
warotrans/v1/robots/{robotCode}/command_ack            # robot → backend (QoS1)
warotrans/v1/robots/{robotCode}/command_result         # robot → backend (QoS1)
warotrans/v1/robots/{robotCode}/teleop                 # backend → robot (QoS0), manual drive — see "Teleop"
warotrans/v1/robots/{robotCode}/interaction_request    # backend → robot (QoS1), arm HUMAN_CONFIRM button
warotrans/v1/robots/{robotCode}/interaction_confirm    # robot → backend (QoS1), button confirmation
warotrans/v1/robots/{robotCode}/interaction_result     # backend → robot (QoS1), business accept/reject
warotrans/v1/robots/{robotCode}/health                 # robot → backend (QoS0), diagnostics snapshot — see "Health"
```

`robotCode` example: `RBT-001`.

HUMAN_INTERACTION is **not** a RobotCommand. The physical button is a confirmation input for a waiting JobStep.

## Heartbeat (~1 Hz)

Optional `capabilities` (array of strings, RB-09): the system actions this robot performs.

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "robotCode": "RBT-001",
  "bootId": "uuid",
  "sequence": 123,
  "sentAt": "2026-10-07T05:00:00.000Z"
}
```

Backend sets connectivity `IsOnline=true` from heartbeat. Robot never sends OFFLINE.  
If no heartbeat within `Mqtt:HeartbeatTimeoutSeconds` (default 5), backend sets `IsOnline=false`.  
Operational `Robot.Status` is not changed by heartbeat alone.  
If a command is `RUNNING` when heartbeat times out, backend aborts that command and ends related `JobAssignment` with `ROBOT_OFFLINE`.

## Telemetry

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "robotCode": "RBT-001",
  "bootId": "uuid",
  "sequence": 456,
  "sentAt": "2026-10-07T05:00:00.000Z",
  "mapVersionCode": "MAP-WH001-V001",
  "pose": { "x": 0.0, "y": 0.0, "yaw": 0.0 },
  "batteryPercent": null,
  "navigationStatus": "IDLE",
  "localizationStatus": "LOCALIZED",
  "linearVelocity": 0.0,
  "angularVelocity": 0.0,
  "currentCommandId": null,
  "errorCode": null,
  "motionHold": false
}
```

`navigationStatus`: `IDLE|NAVIGATING|PAUSED|SUCCEEDED|FAILED|CANCELED`  
`localizationStatus`: `LOCALIZED|LOST|UNKNOWN`

- `pose` is required when `localizationStatus` is `LOCALIZED`; use `null` when `LOST` or `UNKNOWN`.
- `batteryPercent` may be `null` when the robot has no battery sensor.
- When a navigate command is active, `currentCommandId` MUST equal that `commandId`; otherwise `null`.
- Telemetry updates runtime snapshot only. It must not overwrite Fleet operational `Robot.Status`.

## Command (backend → robot)

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "commandId": "uuid",
  "robotCode": "RBT-001",
  "type": "NAVIGATE_TO_POSE",
  "issuedAt": "2026-10-07T05:00:00.000Z",
  "expiresAt": "2026-10-07T05:01:00.000Z",
  "jobAssignmentId": null,
  "jobStepId": null,
  "payload": {
    "frameId": "map",
    "x": 1.0,
    "y": 2.0,
    "yaw": 0.0,
    "route": {
      "graphHash": "sha256-hex",
      "edgeIds": [12, 15, 18]
    }
  }
}
```

`payload.positionTolerance` (m, optional) is the target Endpoint's `position_tolerance`. The gateway accepts an arrival
within it: no arrival re-drive, no docking run in / align when already that close. Nav2's goal checker keeps its own
fixed tolerance. Absent: the gateway's configured defaults.

`payload.route` is **optional** for backward compatibility (legacy free NavigateToPose).
When the robot gateway is launched with `route_graph:=…` (route mode):

- `route` is **required**; missing → ACK `accepted=false`, `reasonCode=ROUTE_REQUIRED`.
- `graphHash` must match the loaded Route Server graph; mismatch → `ROUTE_GRAPH_MISMATCH`.
- Gateway closes all non-granted edges via `DynamicEdgesScorer/adjust_edges`, then
  verifies `ComputeRoute` returns exactly `edgeIds` (order matters). Mismatch →
  `ROUTE_NOT_AUTHORIZED` (no goal sent).
- Leaving the authorized corridor → cancel goal, result `CORRIDOR_VIOLATION`.
- MQTT loss beyond `grant_loss_timeout_sec` → cancel goal (safe stop).

Protocol decision: [adr/0007-traffic-route-ownership.md](adr/0007-traffic-route-ownership.md).

#### Active Mode — `payload.authority` (optional; required when robot `traffic_mode=active`)

```json
"authority": {
  "authorityId": "uuid",
  "epoch": 1,
  "seq": 3,
  "mapVersionId": "uuid",
  "mapVersionCode": "v1",
  "graphHash": "sha256-hex",
  "routeId": "optional",
  "routeVersion": 1,
  "segmentEdgeIds": [12, 15],
  "pathHash": "sha256(graphHash|12,15)",
  "goalSafeStopNodeId": 42,
  "finalGoal": { "x": 1.0, "y": 2.0, "yaw": 0.0 },
  "expiresAt": "2026-10-25T05:00:30.000Z",
  "speedLimits": { "12": 0.4 },
  "maneuvers": [
    { "kind": "Forward", "edgeIds": [12] },
    { "kind": "Spin", "edgeIds": [], "yawTarget": 1.57, "resourceIds": ["node:42"] },
    { "kind": "Reverse", "edgeIds": [15] }
  ]
}
```

`maneuvers` is optional (CompilerVersion 10+). Missing / empty → legacy Forward-only over `segmentEdgeIds`
(older robots). Kinds: `Forward` | `Reverse` | `Spin`. ContinuousArc is **not** an MQTT kind —
classified ContinuousArc stations execute as Forward kink. Active Mode requires
`enable_authority_gate:=true`; Reverse/Spin must not run without an active grant.

Schema version stays **1**. Shadow Mode may omit `authority` and keep using `route`.
See ADR 0010. New commands: `EXTEND_AUTHORITY`, `RENEW_AUTHORITY`, `REVOKE_AUTHORITY`.
Uplink topics: `…/traffic_progress`, `…/authority_state` (QoS1).

#### Semantic Mode (`Traffic:Mode=Semantic`, robot `traffic_mode=semantic_active`)

All additive, schema version stays 1.

- **`…/robots/{code}/traffic_plan`** (robot → backend, QoS1): `planRevision` (> 0), `planHash` (robot hash of
  `poses`), `commandId` (the open backend NAVIGATE; a plan without one is never granted), `poses`, `goal`.
- **`EXTEND_AUTHORITY`** payload adds `planHash` (echo) and `geometry`
  (`cellSizeMeters`, `horizonMeters`, `sampleStepMeters`, `reserveRadiusMeters`, `footprintRadiusMeters`);
  `targetCommandId` is the NAVIGATE the plan belongs to. The robot moves only while its footprint stays inside the
  granted `resourceIds` (cells/zones computed with that geometry, same algorithm as the backend).
- The robot **ACKs** EXTEND / RENEW / REVOKE on `command_ack` (terminal; a refused grant carries `reasonCode`, e.g.
  `STALE_PLAN_REVISION`, `PLAN_HASH_MISMATCH`, `STALE_EPOCH`, `EXPIRED_ON_ARRIVAL`, `DUPLICATE_OR_OLDER`).
- **`{prefix}/traffic/epoch`** (backend → all, QoS1, **retained**): `{epoch, coordinatorId, startedAt}`. Published
  once the host holds the coordinator lease, before any grant of that epoch. A robot drops every grant of an older
  epoch when it sees a newer one.
- **`authority_state`** adds `poseX`, `poseY`, `localizationOk` (the robot's own pose; sent on boot, reconnect and
  epoch change).

### CANCEL

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "commandId": "uuid",
  "robotCode": "RBT-001",
  "type": "CANCEL",
  "issuedAt": "2026-10-07T05:00:00.000Z",
  "expiresAt": "2026-10-07T05:00:30.000Z",
  "jobAssignmentId": "uuid of the target's assignment",
  "jobStepId": null,
  "payload": { "targetCommandId": "uuid" }
}
```

Allowed `type` values: `NAVIGATE_TO_POSE`, `CANCEL` only. (Manual drive uses the separate `teleop` topic below.)

Robot accept/reject rules:

- `NAVIGATE_TO_POSE`: reject if not `LOCALIZED`, or another command is already active (`BUSY`)
- `CANCEL`: reject if `targetCommandId` is not the active command (`UNKNOWN_TARGET`)
- `CANCEL` carrying a `jobAssignmentId` different from the running MOVE's: reject (`JOB_MISMATCH`) — a cancel never
  stops another job's move (TRN-03)
- `expiresAt` (optional, ISO-8601 UTC; TRN-03): `NAVIGATE_TO_POSE`, `CANCEL` and `LOCALIZE` received after it
  (+ `command_expiry_skew_sec`, default 2 s) are rejected with `COMMAND_EXPIRED`. `STOP`, `RESUME` and the authority
  commands never expire. The backend sets NAVIGATE = issuedAt + 60 s, CANCEL = issuedAt + 30 s. A robot without it
  (older gateway) ignores the field. Robots need a synchronised clock (chrony); `command_expiry_skew_sec: -1` turns
  the check off.
- Duplicate delivery of the same `commandId`: ACK `accepted=true` with `reasonCode=ALREADY_ACCEPTED` if already accepted/running/completed for that id

### STOP / RESUME (RB-03)

```json
{ "type": "STOP", "payload": { "mode": "STOP", "reason": "person in aisle" } }
{ "type": "RESUME", "payload": {} }
```

- `mode`: `STOP` or `PAUSE` (same hold; PAUSE is what an operator Job pause sends). Anything else → `INVALID_PAYLOAD`.
- STOP is never refused for being busy. After the ACK the robot cancels its running goal (that goal reports its own
  RESULT `CANCELED`) and **holds every motion**: zero velocity on the hold topic, `authority_ok=false` for the
  authority gate, NAVIGATE refused with `MOTION_HELD`, teleop setpoints dropped.
- RESULT `SUCCEEDED` (`result.stoppedVerified=true`) only once odometry showed |v| ≤ 0.02 m/s and |ω| ≤ 0.05 rad/s for
  0.5 s. Otherwise after 5 s: `FAILED` / `STOP_UNVERIFIED` — the hold stays, the robot never claims a stop it did not see.
- RESUME releases the hold, RESULT `SUCCEEDED`.
- Telemetry field `motionHold` (bool) is the truth the backend shows; a held robot is never dispatched.
- Backend view (`GET /api/fleet/robots/{id}/stop-state`): `REQUESTED` (sent) → `ACCEPTED` (ACK) → `STOPPED_VERIFIED`
  (RESULT SUCCEEDED), or `REJECTED`, or `UNKNOWN` (no ACK/RESULT, robot offline, unverified).
- A software stop is not an E-stop.

### SYSTEM_ACTION (RB-09)

```json
{ "type": "SYSTEM_ACTION", "payload": { "action": "RESTART_STACK" } }
```

- `action`: `RESTART_STACK`, `REBOOT`, `SHUTDOWN`. Only those enabled on the robot (`system_actions_enabled` + a
  configured command) and announced in the heartbeat `capabilities`; else `SYSTEM_ACTION_DISABLED`.
- Accepted only while motion is held and no goal runs (`NOT_STOPPED`). RESULT `SUCCEEDED` is sent before the action
  runs (after a reboot nobody could report it). There is no remote power-on.

## Health (robot → backend, RB-10)

```json
{
  "schemaVersion": 1, "robotCode": "RBT-001", "sentAt": "2026-11-08T08:00:00.000Z",
  "items": [
    { "name": "lidar", "level": "OK", "value": 6.8, "unit": "Hz", "message": null, "measuredAt": "…" },
    { "name": "cpu_temperature", "level": "UNKNOWN", "value": null, "unit": "C", "message": "no thermal sensor" }
  ]
}
```

- Every 5 s. `level`: `OK`, `WARN`, `ERROR`, `STALE` (source stopped), `UNKNOWN` (not measured; value null — never
  invented). Items: configured sensor topics (lidar, odometry, imu, ultrasonic …), `tf_localization`, `nav2`,
  `cpu_load`, `cpu_temperature`, `memory_available`.
- The backend keeps the latest snapshot; older than 15 s it is shown `STALE`.

## CommandAck (robot → backend)

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "commandId": "uuid",
  "robotCode": "RBT-001",
  "accepted": true,
  "reasonCode": null,
  "sentAt": "2026-10-07T05:00:01.000Z"
}
```

`reasonCode` examples when `accepted=false`: `NOT_LOCALIZED`, `BUSY`, `UNKNOWN_TARGET`, `INVALID_PAYLOAD`, `NAV2_UNAVAILABLE`,
`COMMAND_EXPIRED`, `JOB_MISMATCH`.  
When `accepted=true`, `reasonCode` is usually `null` (or `ALREADY_ACCEPTED` for idempotent retry).

## CommandResult (robot → backend)

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "commandId": "uuid",
  "robotCode": "RBT-001",
  "outcome": "SUCCEEDED",
  "errorCode": null,
  "sentAt": "2026-10-07T05:01:00.000Z"
}
```

`outcome`: `SUCCEEDED|FAILED|CANCELED`  
Sent when Nav2 finishes (or cancel completes). Backend correlates by `commandId` (idempotent: duplicate result ignored).

## Interaction request (backend → robot)

Arms the physical HUMAN_CONFIRM button for one waiting PICKUP_CONFIRM / DROPOFF_CONFIRM JobStep.
Published only after the JobStep is committed as WAITING. Not a RobotCommand.

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "robotCode": "RBT-001",
  "jobId": "uuid",
  "jobStepId": "uuid",
  "interactionType": "PICKUP_CONFIRM",
  "containerId": "uuid",
  "endpointId": "uuid",
  "sentAt": "2026-10-20T08:00:00.000Z"
}
```

`interactionType` V1: `PICKUP_CONFIRM` | `DROPOFF_CONFIRM` only.

## Interaction confirm (robot → backend)

One QoS1 message per debounced button press while armed. Backend validates robot assignment,
current WAITING step, interactionType, containerId, endpointId. Completes through the same
`ConfirmHumanStepAsync` path as Staff App (`confirmationSource=ROBOT_BUTTON`).

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "robotCode": "RBT-001",
  "bootId": "uuid",
  "sequence": 42,
  "sentAt": "2026-10-20T08:00:05.000Z",
  "jobId": "uuid",
  "jobStepId": "uuid",
  "interactionType": "PICKUP_CONFIRM",
  "containerId": "uuid",
  "endpointId": "uuid",
  "source": "ROBOT_BUTTON"
}
```

Idempotent on `messageId` / already-completed step with ROBOT_BUTTON evidence.

### Grouped handover and recovery confirmations

For grouped handover, the backend publishes `handoverStop: { id, moveId, version, containerIds }` on an `interaction_request` after Staff begin the stop. The existing `jobStepId` and `containerId` identify the first manifest entry. The gateway echoes `handoverStop: { id, moveId, version }` and sets `requestMessageId` to the arm request's `messageId`. The gateway uses one press to confirm the whole manifest and replaces the previous arm if a newer request arrives. It advertises `HANDOVER_STOP_CONFIRM_V1` only when it supports the grouped request and reply.

For recovery, the backend sends `interactionType: "RECOVERY_TRANSFER_CONFIRM"` and `recoveryTransfer: { id, version, containerIds }` to the rescue robot. The arm request uses the recovery MOVE step as `jobStepId`, the first manifest entry as `containerId`, and the transfer point as `endpointId`. Echo these fields and `recoveryTransfer: { id, version }` together with `requestMessageId`. The gateway advertises `RECOVERY_TRANSFER_CONFIRM_V1` for this flow. Business acceptance comes from `interaction_result`.

Grouped requests are gated by `HumanTasks:EnableHandoverStopButton` and `Recovery:EnableTransferButton`. Both default to false. Enable each after the gateway advertises the matching capability and confirms the expected request, including reconnect, repeat press and a version change. A rejected press leaves the cargo state unchanged.

## Interaction result (backend → robot)

Business acceptance (separate from MQTT QoS). Robot clears armed state on `accepted=true`
or terminal `reasonCode` (`interaction_not_current`, `interaction_wrong_robot`, …, `ALREADY_CONFIRMED`).

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "robotCode": "RBT-001",
  "jobStepId": "uuid",
  "confirmMessageId": "uuid",
  "accepted": true,
  "reasonCode": null,
  "processedAt": "2026-10-20T08:00:05.100Z"
}
```

## Teleop (backend → robot, manual drive)

Off in Semantic Mode (`teleop_enabled: false`, `robot_gateway_semantic.yaml`): with the authority gate on, the ESP32
bridge drives only from `/cmd_vel_motor` and only while the gate is its sole publisher, so no teleop reaches the motors.

Not a command: no `commandId`, no ACK / RESULT, nothing persisted. The web console sends a setpoint every
~200 ms while a direction is held and `{0, 0}` on release (`POST /api/fleet/robots/{id}/teleop`).

The sequenced controller requests `{ sequenced: true }` at `POST /api/fleet/robots/{id}/manual/lease` and retains the returned `leaseId` locally. Renew with `{ sequenced: true, leaseId }` and release with `DELETE /api/fleet/robots/{id}/manual/lease?leaseId=…`. An active sequenced lease cannot be renewed by a second controller using the same account without that lease ID. `serverTime` is available to align the controller's request timestamp. The release or a new lease ends the previous sequence.

Each sequenced setpoint carries `leaseId`, a strictly increasing positive integer `seq`, and UTC `clientSentAt`. The server rejects setpoints over 500 ms old or more than 250 ms ahead, duplicate or out-of-order sequences, and commands for a superseded lease. The MQTT message carries these three fields along with `sentAt`. Reconnecting clients must acquire a fresh lease and wait for a new joystick gesture. A QoS 0 publish does not establish that the robot moved or stopped.

`ManualDrive:EnableSequencedLease` defaults to false. Deploy the gateway with sequence and expiry validation through its collision monitor, motion authority and deadman before enabling it. Fleet migration `20261120090749_SequenceManualDriveLease` stores the current lease ID and sequence.

```json
{
  "schemaVersion": 1,
  "robotCode": "RBT-001",
  "linear": 0.2,
  "angular": 0.0,
  "assist": true,
  "sentAt": "2026-10-15T15:00:00.000Z"
}
```

- `assist` (default `true` when missing): **Drive Assist**. The gateway checks a lidar corridor as wide as the
  chassis in the direction of travel. It scales `linear` down when the gap to an obstacle is under
  `assist_slow_gap` (0.6 m) and holds it at 0 under `assist_stop_gap` (0.15 m). Turning in place and moving away
  are still allowed. With no fresh scan (> 0.5 s), there is no linear motion. It is re-checked every 100 ms
  between messages.

- `linear` m/s (+ forward, − reverse), `angular` rad/s (+ counter-clockwise / left), REP-103.
- Backend: refuses motion (`robot_disabled` / `robot_offline` / `robot_busy` when a navigate command is in flight);
  a stop `{0, 0}` is always forwarded. Backend cap 1.0 m/s, 2.0 rad/s.
- Robot gateway (`teleop_*` params): publishes `geometry_msgs/Twist` on `/cmd_vel`, clamps to its own limits
  (real robot 0.10 m/s, 0.45 rad/s), **stops after `teleop_deadman_sec` (0.5 s) without a message**, ignores motion
  while a navigate command or any Nav2 goal is active, drops messages for another `robotCode` or with non-finite
  numbers, and (optional, `teleop_max_message_age_sec` > 0) messages older than that by `sentAt`.
- No obstacle avoidance: Nav2 is not involved. Use `NAVIGATE_TO_POSE` to reach a point safely.

## Dedup (heartbeat/telemetry)

Same `bootId` with `sequence <= last` is ignored. New `bootId` resets that stream’s baseline.

## Ownership

| Concern | Owner |
|---------|--------|
| `IsOnline` | Backend (from heartbeat timeout) |
| `Robot.Status` (AVAILABLE/RESERVED/EXECUTING/…) | Backend/Fleet |
| `JobAssignment` lifecycle | Backend/Fleet |
| `navigationStatus` / `localizationStatus` | Robot (via telemetry) |
| Command accept/reject + Nav2 result | Robot (via ack/result) |

## Cancelling a transport request (TRN-03)

Cancel is not an E-stop and not a robot command of its own. The backend:

1. records a cancellation (`transport_cancellations`, one active per request, idempotency key);
2. cancels Jobs that carry nothing; for a Job with cargo ONBOARD it sends `STOP` (`mode: PAUSE`) and holds the Job;
3. treats the robot as stopped only when its telemetry reports `motionHold: true` (an offline robot is never assumed
   stopped: `WAITING_ROBOT`);
4. lets staff either resume the Job (deliver what is on board) or unload each container by scanning it onto a shelf;
5. finalizes when every container is delivered, never picked up, or handed over — otherwise `MANUAL_INTERVENTION`.

MQTT QoS 1 may deliver a command twice or late: `commandId` dedupe, `expiresAt` and the `jobAssignmentId` check on
CANCEL keep a late or repeated message from acting on newer work. A PUBACK is never proof that a robot stopped.

### Destination policy (where each robot goes)

Wait Point = Queue Point = Recovery Point: an enabled, non-charger endpoint coded `EP-QUEUE*` / `EP-WAIT*` /
`EP-RECOVERY*`, named with "wait" / "queue" / "recovery", or listed in `FleetIdle:FallbackEndpointCodes`.

| Robot state when cancelled | Destination |
|---|---|
| Nothing picked up, had not started | Parking (left alone when already parked) |
| On its way to a pickup | The nearer free one of a wait point and parking |
| Carrying containers | A recovery point, on request ("Send to recovery point"); it holds still there for the unload by scan |
| At its drop-off, unload not confirmed | Nowhere: reconcile first (confirm the delivery, or unload by scan) |
| Cannot drive safely (not localized, robot fault) | Safe stop (it keeps its `STOP PAUSE` hold) and a technician issue |
| Every container accounted for | Parking (a positioning NAVIGATE; a new Job takes the robot over) |

The recovery leg is the Job's own open MOVE with another goal (`cancelRecoveryToEndpointId`), so it goes through
traffic like any MOVE (Semantic / Shadow; refused in Active mode). Its RESULT does not complete the MOVE: the Job is
held again with `STOP PAUSE`, and "continue delivery" later drives to the real drop-off. Per robot the server lists the
open next steps (`CONTINUE_DELIVERY`, `SEND_TO_RECOVERY`, `REQUEST_MANUAL_HANDOVER`, `UNLOAD_BY_SCAN`) and why the others
are closed. "Continue delivery" is open only for the reasons in `TransportCancellation:ContinueDeliveryReasonCodes`
(default OPERATOR_REQUESTED, CUSTOMER_CANCELLED, OTHER), and always at a drop-off. `TransportCancellation:SendRobotsToParking`
(default true) turns the trip to parking off; a robot that cannot be sent yet is retried for `ParkingRetrySeconds` (90).

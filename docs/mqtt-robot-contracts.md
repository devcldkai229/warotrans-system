# Robot MQTT contracts (shared SoT)

Backend ↔ Robot transport. Topics and payloads for WaroTrans Host and robot gateway.  
Protocol decision: [adr/0005-fleet-mqtt-command-protocol.md](adr/0005-fleet-mqtt-command-protocol.md).

## Topics

```text
warotrans/v1/robots/{robotCode}/heartbeat          # robot → backend (QoS0)
warotrans/v1/robots/{robotCode}/telemetry          # robot → backend (QoS0)
warotrans/v1/robots/{robotCode}/command            # backend → robot (QoS1)
warotrans/v1/robots/{robotCode}/command_ack        # robot → backend (QoS1)
warotrans/v1/robots/{robotCode}/command_result     # robot → backend (QoS1)
```

`robotCode` example: `RBT-001`.

## Heartbeat (~1 Hz)

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
  "errorCode": null
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
  "jobAssignmentId": null,
  "jobStepId": null,
  "payload": { "frameId": "map", "x": 1.0, "y": 2.0, "yaw": 0.0 }
}
```

### CANCEL

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "commandId": "uuid",
  "robotCode": "RBT-001",
  "type": "CANCEL",
  "issuedAt": "2026-10-07T05:00:00.000Z",
  "jobAssignmentId": null,
  "jobStepId": null,
  "payload": { "targetCommandId": "uuid" }
}
```

Allowed `type` values: `NAVIGATE_TO_POSE`, `CANCEL` only.

Robot accept/reject rules:

- `NAVIGATE_TO_POSE`: reject if not `LOCALIZED`, or another command is already active (`BUSY`)
- `CANCEL`: reject if `targetCommandId` is not the active command (`UNKNOWN_TARGET`)
- Duplicate delivery of the same `commandId`: ACK `accepted=true` with `reasonCode=ALREADY_ACCEPTED` if already accepted/running/completed for that id

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

`reasonCode` examples when `accepted=false`: `NOT_LOCALIZED`, `BUSY`, `UNKNOWN_TARGET`, `INVALID_PAYLOAD`, `NAV2_UNAVAILABLE`.  
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

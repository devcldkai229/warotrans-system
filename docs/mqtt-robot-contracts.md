# Robot MQTT contracts (shared SoT)

Backend ↔ Robot transport. Topics and payloads for WaroTrans Host and robot publishers.

## Topics

```text
warotrans/v1/robots/{robotCode}/heartbeat
warotrans/v1/robots/{robotCode}/telemetry
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
Operational `Robot.Status` is not changed by heartbeat.

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

- `pose` is required when `localizationStatus` is `LOCALIZED`; use `null` (do not send a stale/fake pose) when `LOST` or `UNKNOWN`.
- `batteryPercent` may be `null` when the robot has no battery sensor (never invent a value).

Telemetry updates runtime snapshot only (pose, battery, technical statuses). It must not overwrite Fleet operational `Robot.Status`.

## Dedup

Same `bootId` with `sequence <= last` is ignored. New `bootId` resets that stream’s baseline.

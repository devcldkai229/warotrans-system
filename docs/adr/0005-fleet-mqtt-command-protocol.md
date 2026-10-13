# ADR 0005 — Fleet MQTT command protocol (Backend ↔ Robot)

**Status:** Accepted  
**Date:** 2026-10-07

Mirror of robot-side ADR. Canonical payload SoT: [mqtt-robot-contracts.md](../mqtt-robot-contracts.md).  
Robot ADR: `warotrans/docs/adr/0005-fleet-mqtt-command-protocol.md`.

## Decision (summary)

- Downlink: `command` (QoS1); uplink ack/result: `command_ack` / `command_result` (QoS1)
- Types: `NAVIGATE_TO_POSE`, `CANCEL` only
- Backend owns business `RobotStatus` + `JobAssignment`; robot owns technical ACK/result/nav/localization
- Correlate via `commandId`; persist in-flight in `fleet.robot_commands`
- Disconnect while RUNNING → abort command + `AssignmentEndReason.ROBOT_OFFLINE`

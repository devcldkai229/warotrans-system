# Physical Human Interaction Button E2E

## Existing architecture audit

| # | Question | Answer | Source |
|---|----------|--------|--------|
| 1 | HUMAN_INTERACTION executor | Sets step WAITING and stops AdvanceAsync | `JobExecutionEngine.ExecuteStepAsync` |
| 2 | Status when current | `WAITING` | same |
| 3 | Assigned robot | `Job.ContextValues["assignedRobotId"]` | `JobExecutionEngine.StartAsync` |
| 4 | Active jobs per robot | One (busy-check at start) | `RobotsBusyWithOtherJobsAsync` |
| 5 | Advance after confirm | `ConfirmHumanStepAsync` → Save → `AdvanceAsync` | engine |
| 6 | PICKUP/DROPOFF ResolvedInputs | `robotId`, `containerId`, `endpointId` | registry + sample job JSON |
| 7 | Container / Inventory / JobContainer | JobContainer ONBOARD/DELIVERED + HandoverConfirmation; Warehouse Container/InventoryStock **not** updated | engine `SetContainerStatus` |
| 8 | StaffId required? | Staff App: yes. Robot button: no (`ConfirmedBy` null, `ConfirmationSource=ROBOT_BUTTON`) | entity + rules |
| 9 | GPIO library | `python3-lgpio` on Pi 5 gpiochip 4 (same as ultrasonic) | Pi audit + `ultrasonic_node.py` |
| 10 | Other robot→backend events | Only heartbeat/telemetry/ack/result before this task | `RobotMqttTopics` |

**Correlation:** backend arms with exact `jobStepId` via `interaction_request`. Button confirm must match that step. No "latest HUMAN_INTERACTION" lookup.

## Design decision

HUMAN_INTERACTION is a Workflow JobStep, **not** a RobotCommand.  
The physical button is a confirmation **source** (`ROBOT_BUTTON`) sharing `ConfirmHumanStepAsync` with Staff App.

## MQTT topics

| Topic | Direction | QoS |
|-------|-----------|-----|
| `…/interaction_request` | Backend → Robot | 1 |
| `…/interaction_confirm` | Robot → Backend | 1 |
| `…/interaction_result` | Backend → Robot | 1 |

Full payloads: [docs/mqtt-robot-contracts.md](../mqtt-robot-contracts.md).

## GPIO configuration

| Item | Value |
|------|-------|
| Library | `lgpio` (`python3-lgpio`) |
| Chip | gpiochip 4 (Pi 5 RP1) |
| Pin | BCM **12** (physical pin 32, red) ↔ GND (physical pin 34, black) |
| Pull | Internal pull-up |
| Active level | Active-low (idle=1, pressed=0) |
| Debounce | 50 ms stable + 300 ms min interval between events |
| Config | `human_confirm_*` in `robot_gateway.yaml`; env `WARO_HUMAN_CONFIRM_ENABLED`, `WARO_HUMAN_CONFIRM_GPIO_PIN` |
| Default | `human_confirm_enabled: false` |

### Safety review (GPIO change)

- **WHY:** Enable physical handover confirm without Staff App.
- **RISK:** Wrong pin claim could conflict with sensors; mitigated by free BCM12 and default-off.
- **TEST:** Button HIL + unit debounce tests; not E-stop.
- **ROLLBACK:** Set `human_confirm_enabled:=false` / unset env; Staff App confirm still works.

## Robot state machine

`IDLE → ARMED → CONFIRM_PENDING → IDLE` (`InteractionController`).  
Unsupported types (REPORT_ISSUE, …) are not armed. Not an E-stop.

## Backend validation

`RobotInteractionConfirmedHandler` checks: robot assignment, jobId, HUMAN_INTERACTION WAITING current step, interactionType, containerId, endpointId. Then `ConfirmHumanStepAsync(RobotButton)`.

## PICKUP_CONFIRM / DROPOFF_CONFIRM behavior

Same as Staff: HandoverConfirmation row + JobContainer ONBOARD/DELIVERED. No Warehouse InventoryStock change (pre-existing).

## Idempotency

Unique `JobStepId` + unique `SourceMessageId` (nullable). Duplicate MQTT → `ALREADY_CONFIRMED` accepted result, no double JobContainer update.

## Restart / reconnect

`RobotConnectivityRearmHandler` re-sends `interaction_request` when the assigned robot comes online while a handover step is WAITING.

## Unit tests

- Backend: `JobExecutionEngineTests` + `RobotInteractionConfirmedHandlerTests` (22 passed).
- Robot: `test_interaction_controller.py` (11 passed).

## Integration / PC E2E

- `tools/e2e/fake_robot.py --auto-confirm-delay` + `run-job-sim.ps1 -ButtonConfirm -Scenario inbound-multi`.
- Full PC E2E against live Host: run when Host + Mosquitto + WH-SIM seed are up.

## Physical test

- Button wiring confirmed by operator (BCM12 / GND).
- **Physical full E2E PASS (2026-10-21)** on robot `RBT-001` + map `warotrans_map2` / `MAP-WHREAL-V001`:
  - TransportRequest → queue → Job `JOB-20261021-000001` → assign robot → telemetry LOCALIZED on map.
  - MOVE to SRC (`0.512, -0.79`) → `command_result SUCCEEDED` (~0.08 s; robot already near SRC).
  - `interaction_request PICKUP_CONFIRM` → Pi `INTERACTION_ARMED` → button → `interaction_confirm` (`source=ROBOT_BUTTON`, messageId `98aab601-…`) → `interaction_result accepted=true`.
  - MOVE to DST (`2.312, -0.84`) → SUCCEEDED (~15.4 s); pose telemetry progressed along path.
  - `interaction_request DROPOFF_CONFIRM` → button → confirm `443efd5f-…` → accepted → Job **COMPLETED**, TransportRequest **COMPLETED**.
  - DB `handover_confirmations`: 2 rows, `confirmation_source=ROBOT_BUTTON`, `confirmed_by_robot_id=RBT-001`.
  - Evidence JSON: `samples/physical-e2e/responses/` (`01`–`10`, especially `10-summary.json` overall=PASS).
  - Gateway run: `WARO_HUMAN_CONFIRM_ENABLED=true`, `simulated_battery_percent=85` (no real BMS).

## Remaining limitations

- Warehouse Container / InventoryStock still not updated on handover (pre-existing).
- Nav2 goal reliability at corners not re-validated beyond this short ~1.8 m SRC→DST segment.
- `human_confirm_enabled` remains default `false` in YAML; physical runs enable via env / `-p`.

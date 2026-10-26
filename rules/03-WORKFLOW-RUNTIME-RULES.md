# 03 — Workflow Runtime Rules

This document is authoritative for Workflow Definition and runtime binding behavior.

## Supported Step Types
Only:
```text
CHECK
MOVE
HUMAN_INTERACTION
WAIT
```

Admin may configure supported Step Types but cannot create a new executable Step Type without backend code.

## Workflow variables

Admin can click `+ Variable`.

Each variable definition should support at least:
```text
key
label
dataType
source
required
defaultValue?
value?
description?
```

Final variable source enum:
```text
ADMIN_INPUT
STAFF_INPUT
SYSTEM_VALUE
```

### ADMIN_INPUT
Configured by Admin in the Workflow Definition.

Examples:
- speedProfile
- requiredRole
- moveTimeoutSeconds
- fixed chargingEndpointId

### STAFF_INPUT
Rendered dynamically when Staff selects the Workflow while creating a TransportRequest.

```text
Staff selects Workflow
→ backend returns STAFF_INPUT variable definitions
→ frontend renders dynamic form
→ Staff submits values
→ TransportRequest.WorkflowInputs
```

### SYSTEM_VALUE
Resolved by backend from runtime/domain state.

Examples:
- assignedRobotId
- source/destination endpoint resolved by system
- failedRobotId
- replacementRobotId
- originalJobId

## Variable flow
```text
ADMIN CREATES WORKFLOW
        │
        ├── Variable A = ADMIN_INPUT
        ├── Variable B = STAFF_INPUT
        └── Variable C = SYSTEM_VALUE
                 │
                 ▼
Staff selects Workflow
                 │
        dynamic STAFF_INPUT form
                 │
                 ▼
TransportRequest.WorkflowInputs
                 │
                 ▼
runtime resolves all variables
                 │
                 ▼
Job.ContextValues
```

`Job.ContextValues` is a runtime snapshot. Later edits to the Workflow Definition must not silently alter an already-created Job.

## Legacy terminology
Older design material may say:
```text
USER_INPUT
ADMIN_VALUE
SYSTEM_VALUE
```

For the current TransportRequest Workflow Builder use:
```text
STAFF_INPUT
ADMIN_INPUT
SYSTEM_VALUE
```

Do not create a table/entity for variable-source types.

## Step BindingSourceType

Variable source asks:
> Who/what supplies a Workflow variable?

Binding source asks:
> Where does this Step input get its value?

Final code-only enum:
```text
WORKFLOW_VAR
CURRENT_MOVEMENT
STEP_OUTPUT
CONSTANT
```

Do not create a `BindingSource` entity/table.

### WORKFLOW_VAR
```text
WORKFLOW_VAR.speedProfile
→ MOVE.speedProfile
```

### CURRENT_MOVEMENT
Binds from the **active JobContainer** (and matching Detail fields for source/destination), not from a JSON movements array.
Runtime snapshot lives on `JobTask.ContextValues` (not a separate ExecutionScope entity in V1).

Supported paths:
```text
containerId
transportRequestDetailId
jobContainerId
source.endpointId
source.storageLocationId
source.levelNo
destination.endpointId
destination.storageLocationId
destination.levelNo
```

Required-capable paths (may bind to required step inputs): `containerId`, `transportRequestDetailId`, `jobContainerId`, `source.endpointId`, `destination.endpointId`. Storage/level paths are optional-only.

Do **not** store `TransportRequestDetailId` as a column on `JobContainer`; match Detail by RequestId+ContainerId when provisioning. `transportRequestDetailId` / `jobContainerId` exist only as ContextValues catalog keys for Job Runtime later.

Staff-facing form schema (STAFF_INPUT variables + CURRENT_MOVEMENT keys used by bindings):
```text
GET /api/workflow-execution/workflows/{id}/request-input-schema
```
Movement `key` values use the same dotted catalog paths. Do not expose ADMIN_INPUT / SYSTEM_VALUE / CONSTANT / STEP_OUTPUT on that schema.

Example:
```text
CURRENT_MOVEMENT.destination.endpointId
→ MOVE_TO_DESTINATION.targetEndpointId
```

### STEP_OUTPUT
```text
STEP_OUTPUT.CONFIRM_PICKUP.confirmedContainerId
→ CONFIRM_DROPOFF.containerId
```

A Workflow must not bind from a Step that cannot have executed earlier in the valid execution path.

### CONSTANT
Literal Step value:
```text
purpose = PICKUP
```

Do not create a Workflow variable when a constant is enough.

## Runtime rule

`TransportRequestDetail` is the only persisted movement plan.

Do not create `TransportMovement`.
Do not use `TransportRequest.TransportData` JSONB as SoT.

A single TransportRequest may create **N** Jobs. Container allocation lives on `JobContainer`.

```text
TransportRequestDetail lines
                ↓
Job Planning → JobBatchPlan[] (stops + containers)
                ↓
IJobRuntimeProvisioner → 1..N Jobs + JobContainer rows
                ↓
expand each WorkflowTask into 1..N JobTask segments by ExecutionScope
                ↓
JobTask.ContextValues (scope-typed: JOB / STOP / CONTAINER_AT_STOP)
                ↓
WorkflowStep.InputBindings
                ↓
JobStep.ResolvedInputs (just-in-time at execution — empty at provision)
                ↓
Step executor
                ↓
JobStep.OutputValues
```

`Job` must not have a direct `ContainerId`.
`Job` must not have a direct `TransportRequestId` (resolve via JobContainer).
**One WorkflowTask may produce multiple JobTask execution segments.** Do not assume WorkflowTask : JobTask is strictly 1:1.
JobTask/JobStep remain workflow graph instances; do not map 1:1 to Detail/movement.

### JobTask.ContextValues by execution scope

| Scope | Context contents |
|---|---|
| `ONCE_PER_JOB` | Request/batch info only (on Job.ContextValues / empty movement). No CURRENT_MOVEMENT. |
| `ONCE_PER_STOP` | `stopSequenceNo`, `stopAction`, `stopEndpointId`, `containerIds[]`, `jobContainerIds[]`, plus stop-derived `source.endpointId` (PICKUP) or `destination.endpointId` (DROPOFF). **No** singular `containerId` / `jobContainerId` / `transportRequestDetailId`. |
| `PER_CONTAINER_AT_STOP` | Stop keys + `containerId`, `jobContainerId`, `transportRequestDetailId`, and Detail `source.*` / `destination.*`. |

CURRENT_MOVEMENT resolution must reject container-scoped paths on a STOP-scope JobTask (no silent "first container").
## StepType Registry (closed)
Backend `StepTypeRegistry` is the source of truth for StepType metadata (operation codes, inputs, outputs).
Admin Web must load metadata from the API; Admin cannot invent StepTypes, operation codes, input keys, or output keys.

## Execution expansion scope (provision-time)
Job Runtime Provisioner expands WorkflowSteps using a **code-only** `OperationExecutionScopeCatalog`
(`ONCE_PER_JOB` / `ONCE_PER_STOP` / `PER_CONTAINER_AT_STOP`). Scope is not persisted on `WorkflowStep`
and must not be inferred from TaskKey/StepKey strings.

Status:
- **Provisioning is implemented** (`IJobRuntimeProvisioner`).
- **Execution/orchestration is not** (no Job loop, no HumanTask runtime, no robot MOVE bridge yet).
- TransportRequest HTTP API and Job Planner are separate later tasks.

## CHECK
Closed condition codes:
```text
ROBOT_READY
BATTERY_MIN
ENDPOINT_AVAILABLE
LOAD_STATE
REQUEST_ACTIVE
INVENTORY_AVAILABLE
```

If `INVENTORY_AVAILABLE` is used, it must respect the Container/InventoryStock model and must not imply item-level robot transport.
Prefer `containerId` in V1 when product/quantity paths are not yet supported by Warehouse.
Registry outputs for V1: `passed`, `reason`, `checkedAt` (no item-quantity fields).

## MOVE
Closed purposes:
```text
PICKUP
DROPOFF
PARK
CHARGE
TRANSIT
```

Required inputs (registry): `robotId`, `targetEndpointId`, `purpose`.
Optional: `commandTimeoutSeconds`.

MOVE does not update inventory by itself.

## HUMAN_INTERACTION
Closed action codes:
```text
PICKUP_CONFIRM
DROPOFF_CONFIRM
REPORT_ISSUE
PAYLOAD_TRANSFER_CONFIRM
MAINTENANCE_CONFIRM
INSPECTION_CONFIRM
CHARGE_CONNECT_CONFIRM
CHARGE_DISCONNECT_CONFIRM
```

Common outputs: `confirmed`, `confirmedBy`, `confirmationSource`, `confirmedByRobotId`, `confirmedAt`, `note`.

- `confirmationSource` is `STAFF_APP` or `ROBOT_BUTTON`.
- For `ROBOT_BUTTON`, `confirmedBy` is null and `confirmedByRobotId` is the assigned robot.
- For `STAFF_APP`, `confirmedBy` is the Staff account and `confirmedByRobotId` is null.
- PICKUP_CONFIRM / DROPOFF_CONFIRM may be completed by either channel; both call the same runtime confirmation path.

## WAIT
Modes:
```text
DURATION
EVENT
ROBOT_STATE
```

`timeoutSeconds` is an optional input on `EVENT` / `ROBOT_STATE`, not a separate WAIT mode.
Do not use WAIT for Zone/Edge traffic coordination.

## Failure policies
```text
FAIL_JOB
PAUSE_FOR_OPERATOR
REQUEST_REASSIGN
```

Do not invent a new failure policy without approval.

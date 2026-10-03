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

Supported paths:
```text
containerId
source.endpointId
source.storageLocationId
source.levelNo
destination.endpointId
destination.storageLocationId
destination.levelNo
```

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
Job Planning → 1..N Jobs + JobContainer rows
                ↓
select active JobContainer (CURRENT_MOVEMENT context)
                ↓
instantiate runtime JobTask(s) from WorkflowTask template(s)
                ↓
JobTask.ContextValues snapshots CURRENT_MOVEMENT
                ↓
WorkflowStep.InputBindings
                ↓
JobStep.ResolvedInputs
                ↓
Step executor
                ↓
JobStep.OutputValues
```

`Job` must not have a direct `ContainerId`.
`Job` must not have a direct `TransportRequestId` (resolve via JobContainer).
JobTask/JobStep remain workflow graph instances; do not map 1:1 to Detail/movement.
## CHECK
Initial examples:
```text
ROBOT_READY
BATTERY_MIN
ENDPOINT_AVAILABLE
LOAD_STATE
REQUEST_ACTIVE
INVENTORY_AVAILABLE
```

If `INVENTORY_AVAILABLE` is used, it must respect the Container/InventoryStock model and must not imply item-level robot transport.

Typical outputs:
```text
passed
observedValue?
```

## MOVE
Typical inputs:
```text
targetEndpointId
targetEndpointGroupId?
purpose
speedProfile
positionToleranceMeters
yawToleranceDegrees
allowReplan
timeout
```

Typical outputs:
```text
reachedEndpointId
arrivedAt
```

MOVE does not update inventory by itself.

## HUMAN_INTERACTION
Supported examples:
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

Typical outputs:
```text
confirmationId
confirmedContainerId?
confirmedBy
confirmedAt
result
details?
```

## WAIT
Modes:
```text
DURATION
EVENT
ROBOT_STATE
```

Do not use WAIT for Zone/Edge traffic coordination.

## Failure policies
```text
FAIL_JOB
PAUSE_FOR_OPERATOR
REQUEST_REASSIGN
```

Do not invent a new failure policy without approval.

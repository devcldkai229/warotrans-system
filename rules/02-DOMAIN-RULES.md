# 02 — Domain Rules

## Module ownership
A module owns its entities, state transitions, persistence, and use cases.
Cross-module IDs are scalar UUID values, not cross-module EF navigation properties.

## Warehouse

### Container lifecycle
```text
CREATED → PACKED → RESERVED → IN_TRANSIT → STORED
```

Other valid states:
- HOLD
- EMPTY
- OUT_OF_SERVICE

State changes must go through domain/use-case logic.

### Inventory
`InventoryStock` business key:
```text
ProductId + StorageLocationId + LevelNo
```

`ContainerCount` means number of Containers, not product units.

### StorageLocation ↔ Endpoint
A StorageLocation stores one `EndpointId`.

Because Warehouse and Navigation are different modules:
- scalar UUID only;
- no EF navigation to Endpoint;
- validate/resolve through Navigation contracts when required.

## Transportation

`TransportRequest` state machine:
```text
SUBMITTED
QUEUED
IN_PROGRESS
PARTIALLY_COMPLETED
COMPLETED
FAILED
CANCELLED
REJECTED
```

Once `QUEUED`, Detail lines are treated as immutable for planning purposes (replan of FAILED/CANCELLED lines is a later policy).

### Persisted movement plan
The only persisted movement plan is:
```text
TransportRequestDetail (1 TransportRequest → N Details)
```

Do **not** create `TransportMovement`.
Do **not** store the plan in `TransportRequest.TransportData` JSONB.

Each Detail line carries one Container move (source/destination endpoints and optional storage locations).  
Unique within a request: `(TransportRequestId, SequenceNo)` and `(TransportRequestId, ContainerId)`.

`TransportRequestDetail` status:
```text
PENDING
QUEUED
IN_PROGRESS
COMPLETED
FAILED
CANCELLED
```

### Request status aggregation (via Details)
Aggregate Request status from Detail lines (not from Job status alone):
- all PENDING → SUBMITTED / QUEUED
- any IN_PROGRESS / QUEUED after start → IN_PROGRESS
- mix of COMPLETED + non-terminal → PARTIALLY_COMPLETED
- all COMPLETED → COMPLETED
- any FAILED with others COMPLETED → PARTIALLY_COMPLETED; all FAILED → FAILED
- cancelled by staff → CANCELLED

## Workflow definition vs runtime

Design time:
```text
Workflow → WorkflowTask → WorkflowStep
```

Runtime:
```text
TransportRequest (+ Details)
  → Job Planning → 1..N Jobs
  → JobContainer (allocation: Request ↔ Job ↔ Container)
  → Job → JobTask → JobStep
```

One `TransportRequest` may create **N** `Job`s (batching by robot capacity / zone / priority — planning policy).

Request↔Job cardinality is expressed only through `JobContainer` (owned by WorkflowExecution / `execution` schema).  
`Job` must **not** store `TransportRequestId`.  
`Job` must not contain a direct `ContainerId`.  
`JobContainer` must not store `TransportRequestDetailId` (match by TransportRequestId + ContainerId).

Assumption: all `JobContainer` rows for one Job share the same `TransportRequestId` (enforced in planning).

`JobContainer` status:
```text
PENDING
ASSIGNED
ONBOARD
DELIVERED
FAILED
CANCELLED
```

### JobContainer → Detail (same TransportRequestId + ContainerId)
| JobContainer | Detail |
|--------------|--------|
| PENDING | QUEUED or PENDING (planner sets) |
| ASSIGNED / ONBOARD | IN_PROGRESS |
| DELIVERED | COMPLETED |
| FAILED | FAILED |
| CANCELLED | CANCELLED (replan back to QUEUED — decide later) |
## Job state machine
```text
CREATED
QUEUED
ASSIGNED
RUNNING
PAUSED
REASSIGNING
RECOVERY_REQUIRED
COMPLETED
FAILED
CANCELLED
```

Robot fails before pickup:
```text
Job → REASSIGNING
```

Robot fails with Container onboard:
```text
Job → RECOVERY_REQUIRED
```

Payload recovery continues the original Job. Do not create a new business TransportRequest.

## JobTask states
```text
PENDING
READY
RUNNING
PAUSED
COMPLETED
FAILED
CANCELLED
SKIPPED
```

## JobStep states
```text
PENDING
READY
EXECUTING
WAITING
PAUSED
COMPLETED
FAILED
CANCELLED
```

`WAITING` = normal Step waiting.
`PAUSED` = externally suspended / operator intervention.

## Handover
Handover is Container-level.
`HandoverConfirmation` records who confirmed, what Container was confirmed, and when.

V1 validates Container identity, not product-unit quantity.
Legacy examples using `expectedItems` or quantity confirmation do not redefine the V1 physical model.

## Operations
Operations uses MongoDB only:
- `issue_reports`
- `notifications`
- `audit_logs`

Failure to write non-critical Operations documents must not roll back an already committed critical PostgreSQL business transaction.
Use post-commit integration events; introduce Outbox later when reliability requires it.

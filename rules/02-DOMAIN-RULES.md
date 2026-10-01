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
COMPLETED
FAILED
CANCELLED
REJECTED
```

Once `QUEUED`, the movement plan is treated as immutable.

### Persisted movement plan
The only persisted movement plan is:
```text
TransportRequest.TransportData.movements[]
```

Do **not** create `TransportMovement`.

Example:
```json
{
  "schemaVersion": 1,
  "movements": [
    {
      "sequenceNo": 1,
      "containerId": "uuid",
      "source": {
        "storageLocationId": "uuid-or-null",
        "endpointId": "uuid",
        "levelNo": 1
      },
      "destination": {
        "storageLocationId": "uuid-or-null",
        "endpointId": "uuid",
        "levelNo": 2
      }
    }
  ]
}
```

A request may contain one or many movements.

## Workflow definition vs runtime

Design time:
```text
Workflow → WorkflowTask → WorkflowStep
```

Runtime:
```text
TransportRequest → Job → JobTask → JobStep
```

One `TransportRequest` creates one `Job`.

`Job` must not contain a direct `ContainerId`.

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

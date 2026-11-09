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

### Stock follows custody (WH-01)

- Pickup confirmed: 1 off the source shelf level, Container `IN_TRANSIT` with no location.
- Delivery confirmed: 1 on the shelf level and `STORED`; off-shelf on a CONFIRMED outbound voucher: `ISSUED`; any other off-shelf drop: its status before the pickup if never shelved, otherwise `HOLD`.
- A Job that fails or is cancelled with cargo on board leaves it `IN_TRANSIT`. Nothing is assumed returned: a person names the shelf (`POST /api/warehouse/containers/{id}/recover`).
- Every move writes one `warehouse.container_movements` line with a unique key per Job + Container + move. Transportation queues handovers in `transportation.stock_postings` with the Detail and retries until posted.

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

### Recurring waves (WH-09)

A `TransportSchedule` stores a rule (product on a shelf, destination, at most N Containers), not Containers: those are physical. Each occurrence is one `TransportWave` (unique on schedule + time). When due it picks the STORED Containers that match and are on no open request, oldest first, creates and queues one request through the normal path. Nothing matched: `SKIPPED`. Down or paused when due: `MISSED`, never run late. Could not create: `FAILED`, never retried. A queued request waits for a person to start it: a schedule does not move a robot by itself.

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

One `TransportRequest` may create **N** `Job`s (batching by robot capacity / zone / priority — planning policy). `JobPlanning:MaxContainersPerJob` limits a Job until each robot has its own capacity (FL-03). A batch has no table of its own: `Job.ProvisioningKey` (`request:BATCH-00n`) and `JobContainer` hold it, and a request + Container is in one Job only. The Jobs of a request run one after the other: after someone starts it, the next starts when the running one ends.

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
## Capacity (FL-03)

A robot declares `MaxPayloadKg`, `MaxContainers`, `LengthM`, `WidthM`; a Container has `WeightKg`, `LengthM`, `WidthM`. All are entered by a person and may be empty. Planning happens before a robot is chosen, so it splits on the smaller of `JobPlanning:MaxContainersPerJob` and the largest robot in service on the map, and refuses a Container no robot can carry. Dispatch, resume and recovery then refuse a robot the load is too much for, and no override exists. A missing figure does not refuse: the decision records `capacity_unknown`. Traffic reserves one footprint for all robots, so a robot larger than it is refused and a smaller one reserves more than it needs. Container size is stored but not yet compared with anything.

## Job and robot (FL-04)

A Job holds one robot at a time and a robot one Job at a time: `execution.job_robot_assignments` has a unique index on each, over rows with no `EndedAt`. Every engine save keeps those rows in line with the Job. Handing a Job to another robot closes one row and opens another, so the history stays. Several robots on one request means several Jobs, and the request ends when they all have.

## Who handles a human step (WH-03, SY-02)

A waiting HUMAN step can be claimed for a limited time (`HumanTasks:ClaimLeaseSeconds`). While a claim is live, only its holder may confirm; everyone else, and the robot button, gets `409 human_task_claimed`. Confirming a free step claims it in the same write. A claim that runs out is offered to everyone again. An Admin can take a step over, with a reason. `JobStep.DeadlineAt` is stored: past it, an issue is opened and the floor is told once. A deadline never confirms a step and never releases the robot or its reservations.

Confirm All (`/jobs/{id}/handover/confirm-batch`) is partial: each Container gets its own result, and a Container whose turn did not come is `not_reached`.

## Payload recovery (WFX-04, FL-06)

A step failing for good with cargo ONBOARD, or a robot silent past `Recovery:OfflineGraceSeconds` with cargo, sends the Job to `RECOVERY_REQUIRED`, opens a `JobRecoveryCase` and an issue. Cargo stays ONBOARD; it is never marked FAILED for this. The robot keeps what it occupies in traffic.

Then either the same robot resumes, once it is online with a verified pose, or a second robot is sent to a safe endpoint as a MOVE of this Job, and a person confirms the transfer naming the Containers. Only then does the Job change robot, in one transaction. It waits PAUSED until an operator resumes it to the original destination. Same Job, no new request.

Releasing a robot's zones (`release-after-clearance`) rests on a person's word, so it is refused when software can do better: robot online with a pose (reconcile instead), a Job still held, or a navigation running.

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

Confirmation source may be:
- `STAFF_APP` — authenticated Staff/Admin (`ConfirmedBy` = account id).
- `ROBOT_BUTTON` — physical HUMAN_CONFIRM button on the assigned robot (`ConfirmedByRobotId` = robot id; `ConfirmedBy` is null). Do not invent a fake Staff identity for the button.

V1 validates Container identity, not product-unit quantity.
Legacy examples using `expectedItems` or quantity confirmation do not redefine the V1 physical model.

## Operations
Operations uses MongoDB only:
- `issue_reports`
- `notifications`
- `audit_logs`

Failure to write non-critical Operations documents must not roll back an already committed critical PostgreSQL business transaction.
Use post-commit integration events; introduce Outbox later when reliability requires it.

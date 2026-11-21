# TransportRequest ↔ Job Runtime Integration

Guide for the Transportation member implementing `POST CreateTransportRequest`.  
**Do not insert** `Job`, `JobContainer`, `JobTask`, or `JobStep` rows from Transportation.

## Responsibilities

| Module | Owns |
|---|---|
| Transportation | Persist `TransportRequest` + `TransportRequestDetail[]`; build snapshot; plan batches; call WF contracts |
| WorkflowExecution | Validate request vs published Workflow; provision Job runtime graph |

## Client payload (CreateTransportRequest)

Client sends:

```json
{
  "warehouseId": "uuid",
  "mapVersionId": "uuid",
  "workflowId": "uuid",
  "workflowInputs": { },
  "note": "...",
  "details": [
    {
      "sequenceNo": 1,
      "containerId": "uuid",
      "sourceStorageLocationId": "uuid",
      "sourceEndpointId": "uuid",
      "sourceLevelNo": 1,
      "destinationStorageLocationId": "uuid",
      "destinationEndpointId": "uuid",
      "destinationLevelNo": 2
    }
  ]
}
```

For shelf-to-shelf INTERNAL_RELOCATION, populate both source and destination storage/level.
Storage/level remain nullable for point-to-point / receiving-area workflows. A non-null LevelNo
requires the matching StorageLocationId.

Backend generates (do not accept from client):

- `Id`, `RequestCode`, `RequestedBy`, `Status`, `PlanSchemaVersion`
- timestamps, failure fields, `Version`
- Job runtime entities / `assignedRobotId` / assignments / resolved inputs

`sourceLevelNo` / `destinationLevelNo` are **nullable** (`short?`). Use `null` for dock/non-shelf — never `0` as null.

`mapVersionId` is required and copied to `Job.MapVersionId`.

## Staff form schema

```http
GET /api/workflow-execution/workflows/{workflowId}/request-input-schema
```

Returns `workflowInputs` (STAFF_INPUT only) and `movementInputs` (CURRENT_MOVEMENT paths used by bindings, dotted keys e.g. `source.endpointId`).

## Public contracts (WorkflowExecution)

```csharp
IWorkflowRequestValidator.ValidateAsync(workflowId, TransportRequestExecutionSnapshot, ct)
IJobRuntimeProvisioner.ProvisionAsync(snapshot, IReadOnlyList<JobBatchPlan>, ct)
```

### TransportRequestExecutionSnapshot

Cross-module DTO (no EF entities):

- Request ids + `WarehouseId`, `MapVersionId`, `WorkflowId`, `PlanSchemaVersion`
- `WorkflowInputs`
- `Details[]` with endpoints / optional storage / optional levels

### JobBatchPlan / JobStopPlan

Planner (Transportation or shared planning layer) supplies stops:

```text
BatchKey, SequenceNo, ContainerIds[]
Stops[]: SequenceNo, EndpointId, Action (PICKUP|DROPOFF), ContainerIds[]
```

Example C1 A→D, C2 A→E, C3 A→F:

1. Stop A PICKUP C1,C2,C3  
2. Stop D DROPOFF C1  
3. Stop E DROPOFF C2  
4. Stop F DROPOFF C3  

### Provision result

```text
ProvisionJobRuntimeResult { TransportRequestId, Jobs[] }
ProvisionedJobSummary { JobId, JobNo, BatchKey, JobContainerCount, JobTaskCount, JobStepCount }
```

## Recommended CreateTransportRequest flow

```text
1. Validate HTTP payload shape (FluentValidation)
2. Build draft TransportRequestExecutionSnapshot (temp DetailIds OK)
3. IWorkflowRequestValidator.ValidateAsync(...)
4. Persist TransportRequest + Details (real Detail Ids)
5. Rebuild final snapshot with persisted Detail Ids
6. Build JobBatchPlan[] (planning policy — not WF Runtime)
7. IJobRuntimeProvisioner.ProvisionAsync(snapshot, batches)
8. Return request + provisioned job summaries
```

## Idempotency

`Job.ProvisioningKey` = `{transportRequestId:N}:{batchKey}` with DB unique index
`i_x_jobs_provisioning_key`. Retrying `ProvisionAsync` with the same key returns the existing
job summary. Concurrent callers that race the unique index converge on one Job (provisioner
retries after unique-violation).

## JobBatchPlan validation (internal)

`JobBatchPlan` is an INTERNAL planning/provisioning contract — never accept it from Staff UI.
`JobBatchPlanValidator` rejects unknown/duplicate containers, endpoint mismatches,
dropoff-before-pickup, missing pickup/dropoff, and duplicate batch keys with structured errors
(`JobPlanValidationException`, code `job_plan_invalid`).

## Execution scopes → JobTask.ContextValues

| Scope | Example steps | Context |
|---|---|---|
| `ONCE_PER_JOB` | CHECK_READY, CHECK_BATTERY, CHECK_REQUEST | No movement |
| `ONCE_PER_STOP` | CHECK_SOURCE_ENDPOINT, MOVE_PICKUP | Stop keys + stop-derived endpoint only (no singular containerId) |
| `PER_CONTAINER_AT_STOP` | PICKUP_CONFIRM, DROPOFF_CONFIRM | Full container + Detail movement |

One WorkflowTask may produce multiple JobTask segments.

## V1 constraint

One `ContainerId` per TransportRequest (DB unique + validator).  
`JobContainer` has no `TransportRequestDetailId`; matching is RequestId + ContainerId.

## Validation errors (examples)

| Code | Meaning |
|---|---|
| `workflow_not_published` | Workflow must be PUBLISHED |
| `staff_input_missing` | Required STAFF_INPUT absent |
| `duplicate_container_in_request` | Same ContainerId twice |
| `movement_field_missing` | Required CURRENT_MOVEMENT path not on Detail |
| `batch_invalid_container` | Batch references unknown ContainerId |
| `workflow_variable_missing` | Runtime resolve missing required SYSTEM_VALUE (e.g. assignedRobotId) |

## CURRENT_MOVEMENT keys

JobTask.ContextValues use **dotted** catalog paths (`source.endpointId`, …) so `StepInputResolver` works. Snapshot DTO properties stay PascalCase/flat C# names.

## Operator Pause and Resume

`POST /api/workflow-execution/jobs/{id}/pause` requires a reason of up to 500 characters. For Staff, the Job must belong to the active warehouse whose map was most recently published. Jobs on an earlier map of that warehouse are included. The Job detail returns `operatorPause` with `pausedBy`, `pausedAt` and `reason` for an operator pause. Read the Fleet `stop-state` for the result of the robot stop request.

Only the operator recorded on the pause or an Admin may resume an operator-paused Job. `availableActions` reflects this restriction. A direct robot Resume or manual lease request for an operator-paused Job returns `job_paused_robot_held`. Apply WorkflowExecution migration `20261120081415_RecordOperatorPause` before running the updated service.

## Handover stop queue

`GET /api/workflow-execution/handover-stops` lists active stop offers for the Staff warehouse. An offer opens 10 seconds after the robot acknowledges the MOVE to that stop. `mine=true` returns offers held by the current operator. The `containers` array lists the pending handovers at that stop.

`POST /api/workflow-execution/jobs/{jobId}/handover-stops/{id}/claim`, `/begin` and `/release` take `moveId` and `version` from the latest offer. A changed move or version returns `handover_stop_changed`. A claim before robot arrival has no begin deadline. Once the robot is ready, the deadline starts from the later of readiness and claim. Starting the handover preserves its owner until completion. Apply WorkflowExecution migration `20261120083644_RecordHandoverStopClaims` for the queue and claim state.

`POST /api/workflow-execution/jobs/{jobId}/handover-stops/{id}/confirm` takes `{ moveId, version, scans: [{ containerId, barcode }] }` and returns the updated Job detail. The owner can confirm after the robot is ready and the handover has begun, when the offer's `CONFIRM` action is available. Send one valid scan for every container in the offer. A missing or wrong scan leaves the entire stop unchanged. Repeating the confirmed move and version as the same owner returns the Job detail without another custody update. Job detail reports `activeHandoverStopId` as soon as the runtime recognizes the stop, including before the offer opens. Staff use the stop actions when this field is set. The per-step route returns `handover_stop_confirmation_required` for such a stop. Apply WorkflowExecution migration `20261120085006_RecordHandoverStopConfirmation`.

`POST /api/operations/issues` accepts `problemCode` for a `CONTAINER` issue with the Job ID and expected container ID. Supported codes are `WRONG_CONTAINER`, `MISSING_CONTAINER`, `BARCODE_UNREADABLE`, `CONTAINER_DAMAGED` and `QUANTITY_MISMATCH`. If supplied, `jobStepId` must belong to that container on the Job. An open wrong or missing container issue disables the stop's `CONFIRM` action and returns `handover_issue_blocking` on confirmation, including the legacy robot step path where applicable.

Staff who reported a classified handover issue can call `POST /api/operations/issues/{id}/resolve-handover` with `{ expectedVersion, scannedBarcode, resolution }`. The server verifies the expected container's barcode and records the actor and scan. The Issue response includes `problemCode` and actor-specific `allowedTransitions`. Admin and Technician use their scoped transition route and supply `scannedBarcode` when resolving a wrong or missing container issue. Resolution does not advance the Job.

Staff select their work zone with PUT `/api/workflow-execution/handover-stops/work-zone` and `{ zoneId }`, or clear it with `{ zoneId: null }`. GET returns `{ workZone: { warehouseId, code } | null }`. The active `ZONE-AREA-*` polygons on the published map decide work-zone priority. At `offerOpensAt` the offer is available to Staff in that work zone. At `warehouseOpensAt` every Staff member in the operating warehouse can claim. Stops outside work zones open to the warehouse immediately.

Before Begin, send POST `/heartbeat` with the same `{ moveId, version }` at the returned `heartbeatIntervalSeconds`. A heartbeat keeps the connection lease alive and leaves the deadline for Begin unchanged. After Begin, the owner remains assigned even if offline or overdue. POST `/extend` with the latest version adds time to `workDeadline`. The server sends offer, reminder and overdue notifications, and emits `handoverStopsChanged` on `/hubs/notifications`; clients reload the queue and keep REST polling for catch-up. The development profile uses +10 seconds to offer, 5 seconds of priority, 30 seconds to Begin and 15 seconds of grace without a heartbeat before Begin.

Apply Identity migration `20261120104707_StoreStaffWorkZone` and WorkflowExecution migration `20261120104725_TrackHandoverStopDeadlines`.

## Warehouse hazards

POST `/api/operations/hazards` takes `requestId`, `mapVersionId`, `hazardType`, `severity`, `description` and exactly one of `edgeId`, `zoneId` or `endpointId`. The referenced location must be active on the specified published map. Hazard types are `LIQUID_SPILL`, `FALLEN_CARGO`, `FACILITY_WORK`, `FORKLIFT_TRAFFIC` and `OTHER`. Severity uses the four Issue severity values. An unchanged retry by the same account reuses the Issue ID.

The Issue includes a `hazard` with the warehouse, map version, location IDs, location code and type. The `WAREHOUSE_HAZARD` inbox item opens that Issue. Admins, Staff in the active warehouse and Technicians with robot scope there receive the alert. Only authorized issue managers can change its lifecycle. Traffic control remains a separate operation.

To attach an optional photo to an Issue, POST raw JPEG or PNG bytes to `/api/operations/issues/{id}/evidence/photos?photoId={uuid}&expectedVersion={version}` with the matching image Content-Type. The limit is 2 MiB per photo and four photos per Issue. Keep the photo UUID on retry. The response returns the updated Issue, including the authorized GET URI for the stored photo. A failed upload leaves the Issue available and can be retried independently.

## Payload recovery

Under `/api/workflow-execution/jobs/{jobId}/recovery`, GET returns `{ recovery }` with the case ID, version, `claimedBy`, manifest barcodes, robot IDs, `robotArrived` and `availableActions`. GET `/candidates` returns `{ items }` with each robot's effective `maxContainers`, eligibility and reasons for the full cargo currently on board.

POST `/claim` and `/release` take `{ caseId, version }`. The case owner can POST `/assign` with that pair plus `robotId` and `endpointId`, or POST `/unassign` to call the target back. These actions return the updated recovery. Use its latest version after any change.

POST `/transfer-confirm` takes `{ caseId, version, robotId, scans: [{ containerId, barcode }], note? }`. It checks the manifest, the selected robot and its current pose, the request status, and blocking handover issues. On success it returns the Job detail, switches custody to the target robot, and leaves the Job paused for a separate Resume. Repeating the confirmed case, version and target as the original confirmer returns the current Job. POST `/resume-same-robot` instead takes `{ caseId, version, note? }` while the case has no recovery target. When a request stops during recovery, Job detail also disables Resume with `recovery_request_inactive`. Apply WorkflowExecution migration `20261120090215_VersionRecoveryCaseClaims`.

When recovery exposes an enabled `ARM_BUTTON` action, POST `/arm-button` with the same case, version, robot and scans. It verifies the entire manifest, keeps custody on the source robot and returns the new case version. Await the actual outcome through GET. The rescue robot finalizes the prepared transfer only when it echoes the matching arm and passes the current checks. The case records `confirmedByRobotId` for this channel. Apply migration `20261120132828_RecordRecoveryButtonConfirmation`. The gateway contract and capability gates are documented in [MQTT Robot Contracts](mqtt-robot-contracts.md#grouped-handover-and-recovery-confirmations).

## Non-goals (this foundation)

Robot selection, JobAssignment, MQTT, Job execution loop, CreateTransportRequest HTTP endpoint itself.

# Workflow Builder UI Alignment Result

**Date:** 2026-10-13  
**Scope:** Admin Workflow Management frontend alignment with backend source-of-truth  
**Backend runtime/executors:** Not modified (per task constraints)

---

## 1. Files changed

| File | Change |
|------|--------|
| `web/src/features/maps/MapEditorPage.tsx` | Removed legacy WorkflowBuilderPanel; Workflows tool links to `/configure/workflows` |
| `web/src/features/workflows/WorkflowBuilderPanel.tsx` | `@deprecated` header |
| `web/src/features/workflows/constants.ts` | `@deprecated` header |
| `web/src/features/workflows/mock.ts` | `@deprecated` header |
| `web/src/features/workflows/binding-editor.tsx` | Scope-filtered CURRENT_MOVEMENT; help text; hide CURRENT_MOVEMENT on ONCE_PER_JOB |
| `web/src/features/workflows/movement-scope.ts` | **New** — mirrors `CurrentMovementFieldDefinition.IsAvailableAt` |
| `web/src/features/workflows/workflow-editor-page.tsx` | Scope badge, auto purpose CONSTANT, assignedRobotId prompt, pre-publish warnings |
| `web/src/features/workflows/workflows-list-page.tsx` | Created/Published columns, refresh, View/Edit labels |
| `web/src/features/workflows/workflows.css` | Styles for scope badge, auto-constant, system-var prompt, warnings |
| `web/src/shared/api/types.ts` | Documented CatalogField scope filtering approach |

**Unchanged (already correct):**

- `web/src/shared/api/workflows.ts` — canonical API client
- Backend WorkflowExecution contracts/registry/validators

---

## 2. Legacy UI decision

**Choice A applied:** Remove workflow authoring from Map Editor.

- Map Editor Workflows picker now explains that templates are authored in the Admin Workflow editor and links to:
  - `/configure/workflows`
  - `/configure/workflows/new`
- `WorkflowBuilderPanel`, `constants.ts` (`INPUT_SPECS`/`OUTPUT_SPECS`), and `mock.ts` are **deprecated** and **not imported** by any production route.
- Single canonical authoring surface: `WorkflowEditorPage` at `/configure/workflows/*`.

Legacy hard-coded fields no longer reachable from Map Editor:

- `speedProfile`, `positionToleranceMeters`, `yawToleranceDegrees`, `allowReplan`
- `checkType`, `interactionType` (pseudo-inputs)
- `confirmedContainerId`, `confirmationId`, `result`, `details`
- Resource types `ENDPOINT` / `CONTAINER` / `STORAGE_LOCATION` / `INT` / `BOOL`

---

## 3. API endpoints actually used

| Method | Path | Client function |
|--------|------|-----------------|
| `GET` | `/api/workflow-execution/metadata/step-types` | `fetchWorkflowMetadata()` |
| `GET` | `/api/workflow-execution/workflows` | `listWorkflows()` |
| `GET` | `/api/workflow-execution/workflows/{id}` | `getWorkflow(id)` |
| `POST` | `/api/workflow-execution/workflows` | `createWorkflow(payload)` |
| `PUT` | `/api/workflow-execution/workflows/{id}` | `updateWorkflow(id, payload)` |
| `POST` | `/api/workflow-execution/workflows/{id}/publish` | `publishWorkflow(id)` |
| `POST` | `/api/workflow-execution/workflows/{id}/versions` | `createWorkflowVersion(id)` |

No silent mock fallback on these routes.

---

## 4. Metadata mapping

UI options are driven exclusively from `WorkflowMetadataResponse`:

| UI surface | Metadata field |
|------------|----------------|
| Step type select | `stepTypes[].stepType` |
| Operation select | `stepTypes[].operations[].code` |
| Input bindings | `operations[].inputs` |
| Outputs list | `operations[].outputs` |
| Allowed CONSTANT values | `inputs[].allowedValues` |
| Binding sources | `bindingSources` |
| Variable sources | `variableSources` |
| Data types | `dataTypes` |
| Failure policies | `failurePolicies` |
| SYSTEM_VALUE keys | `systemVariables` |
| CURRENT_MOVEMENT paths | `currentMovementFields` (+ scope filter) |
| Scope badge | `operations[].executionScope` / `stopActionFilter` |

Operation is labeled **Operation**, not pseudo-inputs `checkType` / `interactionType`.

---

## 5. Variable behavior

| Source | UI behavior |
|--------|-------------|
| `ADMIN_INPUT` | Shows configuredValue; parsed by dataType (INTEGER/DECIMAL/BOOLEAN) |
| `STAFF_INPUT` | No configuredValue field; value cleared when switching away from ADMIN_INPUT |
| `SYSTEM_VALUE` | Key selected from `metadata.systemVariables`; dataType locked to catalog |

Supported data types from metadata only: `STRING`, `INTEGER`, `DECIMAL`, `BOOLEAN`, `UUID`, `DATETIME`.

**assignedRobotId UX:** When selected operation requires `robotId` and no `SYSTEM_VALUE` variable `assignedRobotId` exists, UI shows:

> Add required system variable: assignedRobotId

---

## 6. Step/Operation behavior

- Operations come from metadata (MOVE: PICKUP/DROPOFF/PARK/CHARGE/TRANSIT; CHECK conditions; HUMAN action codes; WAIT modes).
- Generic rule: if `operationFieldName` is also a required input (MOVE `purpose`), editor auto-binds:

```json
{
  "sourceType": "CONSTANT",
  "constantValue": "<operationCode>"
}
```

and renders it read-only (“synced with operation”). Changing operation resets bindings and re-syncs that field.

- Required inputs for MOVE (`robotId`, `targetEndpointId`, `purpose`) and HUMAN confirm (`robotId`, `containerId`, `endpointId`) render from metadata.
- Outputs listed from metadata only (HUMAN: `confirmed`, `confirmedBy`, `confirmedAt`, `note` — no `confirmedContainerId`).

---

## 7. CURRENT_MOVEMENT filtering

Implemented in `movement-scope.ts` mirroring backend `IsAvailableAt`:

| Scope | Allowed paths |
|-------|----------------|
| `ONCE_PER_JOB` | none (CURRENT_MOVEMENT source hidden) |
| `ONCE_PER_STOP` + PICKUP | `source.endpointId` only |
| `ONCE_PER_STOP` + DROPOFF | `destination.endpointId` only |
| `PER_CONTAINER_AT_STOP` | all catalog paths |

Help copy:

> Runtime context from TransportRequestDetail and Job planning. Admin/Staff do not enter this value directly.

---

## 8. ExecutionScope UI

Read-only badge on each step with operation selected:

- Once per job
- Once per stop · Pickup / Dropoff
- Per container at stop · Pickup / Dropoff

Tooltips explain expansion semantics. ONCE_PER_JOB also shows hint that CURRENT_MOVEMENT is unavailable.

---

## 9. Create / Update / Publish flow

1. **Create** (`/configure/workflows/new` → Save) → `POST /workflows` → navigate to `/configure/workflows/{id}` → invalidate list + detail queries.
2. **Update** → `PUT /workflows/{id}` → replace draft from server response (`toUpsert(saved)`).
3. **Publish** → client warnings first; then `POST /workflows/{id}/publish` → status/`publishedAt` from server. PUBLISHED is read-only; “New version” available.
4. **List** → `GET /workflows` with Code, Version, Name, Status, Created, Published; Refresh button; no mock cache.

Server `ApiError` field/path messages displayed in `error-list`.

---

## 10. INBOUND template guidance (UI-valid shape)

Admin can author (no auto-seed of invalid CHECK INVENTORY_AVAILABLE):

**Variables**

- `assignedRobotId` UUID SYSTEM_VALUE
- `minBatteryPercent` DECIMAL ADMIN_INPUT (e.g. 25)

**Task 1 – Collect**

- CHECK ROBOT_READY → robotId ← WORKFLOW_VAR.assignedRobotId  
- CHECK BATTERY_MIN → robotId ← WORKFLOW_VAR.assignedRobotId; minimumBatteryPercent ← WORKFLOW_VAR.minBatteryPercent  
- MOVE PICKUP → robotId ← WORKFLOW_VAR; targetEndpointId ← CURRENT_MOVEMENT.source.endpointId; purpose ← CONSTANT.PICKUP (auto)  
- HUMAN PICKUP_CONFIRM → robotId; containerId ← CURRENT_MOVEMENT.containerId; endpointId ← source.endpointId  

**Task 2 – Put away**

- CHECK ENDPOINT_AVAILABLE → endpointId ← CURRENT_MOVEMENT.destination.endpointId  
- MOVE DROPOFF → purpose auto CONSTANT.DROPOFF; targetEndpointId ← destination.endpointId  
- HUMAN DROPOFF_CONFIRM → containerId ← CURRENT_MOVEMENT.containerId (not STEP_OUTPUT confirmedContainerId)

### Known backend limitation (not faked)

`CHECK INVENTORY_AVAILABLE` requires `containerId` at **ONCE_PER_JOB**, where CURRENT_MOVEMENT is banned. UI warns and does not auto-create that step. Architecture decision on scope/binding remains pending (audit F-05).

---

## 11. Verification

### Frontend build

```text
npm run lint      → pass (0 warnings after moving isMovementFieldAvailable)
npm run typecheck → pass
npm run build     → pass
```

### Frontend tests

No unit/e2e test harness in `web/` (`package.json` has lint/typecheck/build only). Behavioral checks covered by source alignment + typecheck. Recommend adding Vitest later for `isMovementFieldAvailable` and `toUpsert`.

### Live API evidence

Host was not running during this alignment pass (prior background Host on :5090 was terminated). Endpoint paths and payload shapes verified against:

- `GetWorkflowMetadata/Endpoint.cs`
- `CreateWorkflow` / `UpdateWorkflow` / `PublishWorkflow` features
- `WorkflowDtos` / `UpsertWorkflowRequest`
- Existing `web/src/shared/api/workflows.ts`

**Manual verification checklist (when Host is up):**

1. GET metadata → UI operations/inputs/outputs match JSON  
2. POST create draft → navigate + GET detail equals editor  
3. GET list shows new row  
4. PUT update name → GET reflects change  
5. Publish valid inbound-style template → status PUBLISHED on detail + list  
6. Confirm CURRENT_MOVEMENT options change when switching MOVE PICKUP ↔ DROPOFF ↔ CHECK ROBOT_READY  

---

## 12. Summary

| Goal | Status |
|------|--------|
| Single canonical Workflow builder | Done — Map Editor redirects |
| No hard-coded wrong schema on production routes | Done |
| Metadata-driven steps/inputs/outputs | Done (pre-existing + strengthened) |
| CRUD + publish via real API | Done (pre-existing client retained) |
| Scope-filtered CURRENT_MOVEMENT | Done |
| Execution scope badges | Done |
| Auto purpose CONSTANT | Done |
| assignedRobotId prompt | Done |
| Pre-publish client warnings | Done |
| Backend runtime unchanged | Confirmed |

**No production backend code was modified for this alignment.**

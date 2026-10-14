# Transport Request Create — FE↔BE Integration E2E Result

Date: 2026-10-14  
Scope: Real Transport Request create (composer + list/detail) connected to backend APIs. No Queue/Planner/Job side effects on create.

## 1. Verdict

**PASS.** Create persists `TransportRequest` + Details atomically as `SUBMITTED` / `PENDING`. Cases A (browser), B and C (API) verified in PostgreSQL with `execution.jobs = 0`.

## 2. METHOD + PATH (new / used)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/transportation/transport-requests` | Create (existing; hardened) |
| GET | `/api/transportation/transport-requests` | List (new) |
| GET | `/api/transportation/transport-requests/{id}` | Detail (new) |
| GET | `/api/warehouse/containers` | List/search containers (new) |
| GET | `/api/warehouse/storage-locations` | List storage locations (new) |
| GET | `/api/warehouse/containers/{id}` | Get container (mapped existing) |
| GET | `/api/warehouse/containers/by-barcode/{barcode}` | Get by barcode (mapped existing) |
| GET | `/api/warehouse/warehouses` | Warehouses (existing) |
| GET | `/api/navigation/warehouses/{id}/maps` | Maps (existing) |
| GET | `/api/navigation/maps/{id}/detail` | Map + endpoints (existing) |
| GET | `/api/workflow-execution/workflows?status=PUBLISHED` | Published workflows (existing) |
| GET | `/api/workflow-execution/workflows/{id}/request-input-schema` | STAFF_INPUT schema (existing) |

## 3. APIs implemented / changed

**Warehouse contracts**
- `IWarehouseModule.GetStorageLocationsAsync`
- `ContainerSnapshot` extended with `CurrentStorageLocationId`, `CurrentLevelNo`
- `StorageLocationSnapshot` added

**Navigation contracts**
- `EndpointSnapshot.Name` added

**Create hardening**
- StorageLocation exists / active / warehouse match / `EndpointId` match
- Level `>= 1` when present (FluentValidation)
- Duplicate containers already rejected in validator
- Stable error codes: `storage_location_not_found`, `storage_location_inactive`, `storage_location_warehouse_mismatch`, `storage_location_endpoint_mismatch`

**Read slices**
- `ListTransportRequests`, `GetTransportRequest` with contract enrichment (barcode, location code, endpoint code/name)

## 4. Frontend changes

- Real API clients: `transportRequests.ts`; `listContainers` / `listStorageLocations` on `warehouses.ts`
- Composer data via TanStack Query (warehouses, published maps, map detail, workflows, schema, locations, debounced containers)
- STAFF_INPUT fields from request-input-schema; Requested-by from `useAuth`
- Real create mutation + `toCreateRequestBody` mapper; list invalidate + select new id
- `TransportRequestsPage` real list/detail/map/robots; fixtures/demo scenarios removed from production path

## 5. Files touched (high level)

Backend: `Warehouse/Contracts`, `WarehouseModuleApi`, `ListContainers`, `ListStorageLocations`, `WarehouseModule`, `INavigationModule`, `NavigationModuleApi`, `CreateTransportRequest` Handler/Validator, `ListTransportRequests`, `GetTransportRequest`, `TransportationModule`, unit/integration tests.

Frontend: `shared/api/{transportRequests,warehouses}.ts`, composer (`types`, data hook, submit, panels, page mapper), `TransportRequestsPage`, vitest for payload mapper.

Tools: `tools/e2e/transport-request-setup.mjs`, `tools/e2e/transport-request-cases.mjs`.

## 6. Live E2E cases

| Case | Channel | Request | Result |
|------|---------|---------|--------|
| A inbound | Browser UI | `REQ-20261014-000032` | PASS — Inbound Dock → LOC-A2 / L1 |
| B outbound | API | `REQ-20261014-000030` | PASS — LOC-A1 → Outbound Dock; STAFF_INPUT `handlingInstruction` |
| C relocation | API | `REQ-20261014-000031` | PASS — 2 details B1→C1, B2→C2 |

## 7. DB round trip

All three rows: `status=SUBMITTED`, details `PENDING`, `requested_by` set (admin account), workflow_inputs only STAFF_INPUT keys (B) or `{}` (A/C).

## 8. No Job side effect

`SELECT count(*) FROM execution.jobs` → **0** before and after create (A/B/C). Create never calls Queue/Planner/Provisioner.

## 9. Validation / error codes covered in tests

Unit (CreateTransportRequest): happy paths, warehouse inactive, map not published / mismatch, endpoint missing/disabled/wrong map, container missing/ineligible/already requested, duplicate sequence/container, STAFF_INPUT / unpublished workflow leave nothing persisted, storage location not found / inactive / warehouse mismatch / endpoint mismatch, level &lt; 1.

Integration: create persistence, atomic multi-detail, list/get enrichment, storage location endpoint mismatch HTTP, list containers/locations, queue still separate (existing).

## 10. Frontend tests

- `toCreateRequestBody.test.ts` — PASS
- Existing map transform tests — PASS
- Total web vitest: 10 passed

## 11. Lint / typecheck / build

| Check | Result |
|-------|--------|
| web oxlint | PASS |
| web tsc | PASS |
| web vite build | PASS (chunk-size warning only) |
| backend Host build | PASS |
| unit tests (Create + MapVersion filter) | 43 passed |
| integration (TransportRequest filter) | 12 passed |

## 12. Architecture compliance

- Vertical Slice + Minimal API + FluentValidation + EF
- Cross-module via public contracts only (no foreign DbContext)
- No new domain entities / tables / statuses / Step Types
- No TransportMovement / BindingSource / Traffic* entities
- Create does not auto-Queue

## 13. Setup tooling

- `node tools/e2e/transport-request-setup.mjs` — HTTP for map/endpoints/workflows; SQL for warehouse products/locations/containers
- State: `tools/e2e/transport-request-setup.state.json`
- Cases: `node tools/e2e/transport-request-cases.mjs`

## 14. Known gaps / non-blockers

- Jobs are not linked on list/detail yet (empty `jobs[]` for SUBMITTED — expected until Queue)
- `requestedByName` shows a short account id fragment (no Identity name join on Transportation read)
- Warehouse master create APIs still absent (E2E uses SQL tooling only)
- Integration tests truncate the shared DB; restart Host to re-seed admin before UI E2E

## 15. Blockers

None for create integration.

## 16. Manual UI notes (case A)

Admin login → Monitor → Transport requests → New request → warehouse TR-E2E-WH → map TR-E2E Map → E2E Plain Transport → add CTN-E2E-IN-001 → source Inbound Dock → destination LOC-A2 L1 → Review → Create. Banner and Submitted list updated.

## 17. PASS / FAIL checklist

- [x] Persist TR + Details atomically SUBMITTED/PENDING
- [x] RequestedBy from authenticated user
- [x] workflowInputs STAFF_INPUT only
- [x] Validate warehouse / map / workflow / endpoints / locations / containers / levels
- [x] No auto-Queue / Planner / Job
- [x] Frontend real reference data + create + list/detail
- [x] Live A (browser), B, C (API)
- [x] DB verify + jobs unchanged
- [x] Lint / typecheck / build / tests green

## 18. Evidence artifacts

- `tools/e2e/transport-request-setup.state.json`
- `tools/e2e/transport-request-cases.result.json`
- DB rows `REQ-20261014-000030` … `000032`
- This document

## 19. Follow-ups (optional, out of scope)

- Queue button / Job list join on request detail
- Identity name enrichment for `requestedByName`
- HTTP create APIs for Product / StorageLocation if product wants non-SQL seeding

# Robot Registration UI + Backend Result

## Backend existing state

- `POST /api/fleet/robots` (RegisterRobot) already existed.
- `GET /api/fleet/robots`, `GET /api/fleet/robots/{id}`, enable/disable already existed.
- Domain factory `Robot.Register(...)` seeds: Status=OFFLINE, Battery/Pose=0, IsEnabled=true, IsOnline=false.
- Unique index on `fleet.robots.code` (global, not warehouse-scoped).
- Register previously auto-generated `RBT-###` via `IBusinessCodeGenerator` and did **not** validate Warehouse/MapVersion.

## APIs found

| Method | Route | Status before |
|--------|-------|---------------|
| POST | `/api/fleet/robots` | Exists (no cross-module validation; code auto-gen) |
| GET | `/api/fleet/robots` | Exists |
| GET | `/api/fleet/robots/{id}` | Exists |
| POST | `/api/fleet/robots/{id}/enable` | Exists |
| POST | `/api/fleet/robots/{id}/disable` | Exists |
| GET | `/api/navigation/warehouses/{warehouseId}/maps` | Exists |
| GET | `/api/warehouse/warehouses` | Missing |

## APIs added / changed

### Changed: `POST /api/fleet/robots`

Request now accepts Admin-owned business inputs only:

```json
{
  "warehouseId": "uuid",
  "currentMapVersionId": "uuid",
  "code": "RBT-001",
  "name": "Warehouse Robot 01"
}
```

Handler now:

1. Validates warehouse via `IWarehouseModule` (exists + active).
2. Validates map via `INavigationModule` (exists, belongs to warehouse, PUBLISHED).
3. Trims/uppercases code; rejects duplicate (`robot_code_exists`).
4. Calls `Robot.Register(...)`.
5. Catches Postgres unique violation as `ConflictException`.

### Added: `GET /api/warehouse/warehouses`

Query: `isActive`, `skip`, `take`.

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "code": "WH-001",
      "name": "Main warehouse",
      "isActive": true,
      "createdAt": "2026-10-13T00:00:00Z"
    }
  ],
  "total": 1
}
```

## Validation

| Rule | Code |
|------|------|
| warehouseId / currentMapVersionId / code / name required | FluentValidation |
| code max 30, name max 100 | FluentValidation + EF |
| warehouse not found | `warehouse_not_found` |
| warehouse inactive | `warehouse_inactive` |
| map not found | `map_version_not_found` |
| map warehouse mismatch | `map_version_warehouse_mismatch` |
| map not PUBLISHED | `map_version_not_published` |
| duplicate code | `robot_code_exists` |

Runtime fields (status, battery, pose, telemetry, heartbeat, command id, …) are **not** accepted on create.

## Database constraints

- **Code uniqueness:** global `UNIQUE(code)` on `fleet.robots` (confirmed in `RobotConfiguration`).
- Not warehouse-scoped `UNIQUE(warehouse_id, code)`.
- Application `ExistsAsync` + DB unique violation catch.

## Frontend routes

| Route | Behavior |
|-------|----------|
| `/monitor/fleet` | Robot list + map + Register dialog |
| `/monitor/fleet/:robotCode` | Same page; detail panel for that robot |

No `/management/fleet/...` route — Fleet lives under Monitor (existing architecture).

## Create form fields

Dialog: **Register Robot**

- Robot Code * (text, trim + uppercase)
- Robot Name *
- Warehouse * (from `GET /api/warehouse/warehouses?isActive=true`)
- Current Map Version * (from `GET /api/navigation/warehouses/{id}/maps`, PUBLISHED only; disabled until warehouse selected; reset on warehouse change)

Read-only Initial State preview:

- Operational Status: OFFLINE
- Connectivity: Offline
- Enabled: Yes

## Fields intentionally read-only / system-owned

Battery, Pose, NavigationStatus, LocalizationStatus, velocities, ErrorCode, MapVersionCode, CurrentCommandId, LastHeartbeatAt, LastTelemetryAt, boot/sequence fields, CreatedAt/UpdatedAt, Status, IsOnline.

## Warehouse → MapVersion behavior

1. Load active warehouses.
2. On warehouse select → fetch maps for that warehouse.
3. UI lists PUBLISHED maps only.
4. Backend re-validates PUBLISHED + warehouse ownership.

## Robot list

- Live `listRobots` with search + status chips.
- Cards show code, name, connectivity (Online/Offline), enabled, operational StatusBadge.
- Header **Register Robot** + empty-state button open the dialog.
- After success → navigate `/monitor/fleet/{code}`.

## Robot detail

Sections: Identity, Operational (status / enabled / connectivity), Navigation, Telemetry, Connectivity, Health, System, plus existing job/history placeholders.

Enable / Disable actions call real endpoints and invalidate fleet queries.

Telemetry values shown as "—" until `lastTelemetryAt` is set (see limitations).

## Enable/Disable

Reused existing:

- `POST /api/fleet/robots/{id}/enable`
- `POST /api/fleet/robots/{id}/disable`

Wired in Robot Detail panel.

## Live API evidence

Local Host (`localhost:5090`) was not running during this session.

**Integration tests (TestServer, full stack) — PASS: 9/9**

```text
Register_robot_persists_and_returns_initial_state
Register_duplicate_code_returns_conflict
Register_unknown_warehouse_returns_404
Register_map_wrong_warehouse_returns_validation_error
Get_robot_returns_created
List_robots_filters_by_warehouse
Enable_disable_robot_roundtrip
Get_unknown_robot_returns_404
List_warehouses_returns_seeded
```

Example register contract exercised by tests:

```json
{
  "warehouseId": "<seeded>",
  "currentMapVersionId": "<published>",
  "code": "RBT-ALPHA-XXXXXX",
  "name": "Alpha Bot"
}
```

Expected response shape fields asserted:

- `status`: OFFLINE
- `isOnline`: false
- `isEnabled`: true
- `batteryPercent`: 0
- `code` / `name` / warehouse / map ids match request

## Tests

| Suite | Result |
|-------|--------|
| RobotRegistry integration (9) | PASS |
| Backend Release build | PASS |
| Web typecheck + lint | PASS |

## Remaining limitations

1. **Battery/Pose initial 0 vs “never received telemetry”:** entity fields are non-nullable decimals/doubles defaulting to 0. Frontend uses `lastTelemetryAt == null` as “No telemetry yet” and shows "—" for pose/battery until first telemetry. Cannot distinguish 0% battery from “never set” at the DB layer without schema change.
2. **RobotStatus vs IsOnline:** both can be OFFLINE / false after register. Status is operational lifecycle; IsOnline is heartbeat connectivity. UI labels them separately.
3. **Code uniqueness:** global UNIQUE(Code), not per-warehouse.
4. **Warehouse / map names on detail:** Identity section currently shows UUIDs (no join API for warehouse/map display names on RobotResponse).
5. **Job activity / state history:** still mock / null on detail (out of scope).
6. **Live Host smoke:** not run (API not listening); rely on integration tests.
7. **Register no longer auto-generates code** — Admin must supply Code (matches registration UI requirements).

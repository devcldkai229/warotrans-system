# Navigation Map Domain Readiness

**Date:** 2026-10-14  
**Scope:** ROS2/Nav2 occupancy MapVersion metadata, local yaml+pgm import, GeoJSON Edge/Zone geometry, Zone CRUD + typed policies, world↔pixel transform, Facility/Map Editor API wiring.

## Verdict

Ready for Admin map import + draft editing against real Navigation APIs. Graph planner, junctions, From/ToEndpoint, PostGIS, cloud storage, and OTTO-specific ZoneType values remain out of scope.

## Rules conflict (documented)

[`rules/05-NAVIGATION-RULES.md`](../../rules/05-NAVIGATION-RULES.md) still describes Edge/Zone geometry as `{ "points": [{x,y}] }`. **Persisted contract is now GeoJSON** (`LineString` / `Polygon` in world meters, frame = `MapVersion.FrameId`). Update the rules doc in a follow-up; this audit is the source of truth until then.

## Schema / migration

**Migration:** `AddMapVersionRosMetadataAndGeometryContracts`  
(`backend/src/Modules/Navigation/Persistence/Migrations/20261014011951_AddMapVersionRosMetadataAndGeometryContracts.cs`)

### MapVersion (additive)

| Field | Notes |
|-------|--------|
| `Code` | Unique per `(WarehouseId, Code)`; generated `MAP-{warehouseCode}-V{nnn}` |
| `MapUri` | Occupancy raster URI (PGM after import) |
| `MapYamlUri`, `PreviewImageUri` | Public `/map-assets/...` paths |
| `FrameId` | Default `"map"` |
| `ImageWidthPixels`, `ImageHeightPixels` | From PGM header after import |
| `Negate`, `OccupiedThreshold`, `FreeThreshold` | ROS map.yaml |
| `ContentHash` | SHA-256 hex of pgm+yaml bytes |

### Edge

- Geometry: GeoJSON LineString  
- `WidthMeters` `double NOT NULL` default `1.0`, check `> 0`

### Zone

- Geometry: GeoJSON Polygon  
- `Policy` jsonb nullable  
- `PolicySchemaVersion` int NOT NULL default `1`

## Geometry JSON examples

Edge:
```json
{ "type": "LineString", "coordinates": [[0, 0], [5.2, 0], [5.2, 3]] }
```

Zone:
```json
{ "type": "Polygon", "coordinates": [[[0,0],[4,0],[4,3],[0,3],[0,0]]] }
```

## OriginYaw convention

- ROS/Nav2: `origin` is the world pose of the **lower-left** corner of the occupancy image.
- `OriginYaw` is radians (CCW) of that frame relative to world.
- Frontend: `pixelToWorld` / `worldToPixel` in `web/src/shared/map/mapCoordinateTransform.ts` (image Y down → world Y via `imageHeight - 1 - v`).

## ZoneType policies (existing enums only)

| ZoneType | Rules |
|----------|--------|
| `RESTRICTED_AREA` | empty/null policy OK; Capacity ≥ 1 |
| `NARROW_AREA` | Capacity = 1; MaxSpeed required (m/s) |
| `INTERSECTION` | optional `{ preferredDirectionYaw, headingToleranceRadians }` |
| `OPERATIONAL_AREA` | optional `{ costMultiplier > 0 }` |

## APIs

| Method | Path |
|--------|------|
| GET | `/api/navigation/warehouses/{warehouseId}/maps` |
| POST | `/api/navigation/warehouses/{warehouseId}/maps` |
| POST | `/api/navigation/warehouses/{warehouseId}/maps/import` (multipart `yaml` + `pgm`) |
| GET | `/api/navigation/maps/{id}` |
| GET | `/api/navigation/maps/{id}/detail` |
| PUT | `/api/navigation/maps/{id}` |
| POST | `/api/navigation/maps/{id}/publish` |
| POST | `/api/navigation/maps/{id}/archive` |
| CRUD | `/api/navigation/maps/{id}/endpoints`, `/endpoints/{id}` |
| CRUD | `/api/navigation/maps/{id}/edges`, `/edges/{id}` |
| CRUD | `/api/navigation/maps/{id}/zones`, `/zones/{id}` |

Static assets: Host `UseStaticFiles` at `/map-assets` → `data/maps/{warehouseId}/{mapVersionId}/`.

## Frontend

- `navigation.ts` — list/detail/import/publish + endpoint/edge/zone CRUD  
- Facility — active warehouse maps, import dialog, publish  
- Map Editor — loads detail, preview PNG, world-meter edits, Save/Publish; read-only when not DRAFT  
- vitest: transform round-trips (zero + non-zero yaw)

## Test results (2026-10-14)

| Suite | Result |
|-------|--------|
| `dotnet test` filter `Navigation` (UnitTests) | **100 passed** |
| `npm test` (vitest transform) | **3 passed** |
| `npm run typecheck` / `build` / `lint` | **OK** (lint clean after Facility fix) |

Integration Edge/Endpoint suites updated for GeoJSON + warehouse seeding; not re-run in this pass (requires Docker Postgres).

## Limitations

- No PostGIS; geometry is jsonb only  
- No graph / junction / FromToEndpoint on Edge  
- ZoneType is not OTTO’s full enum set  
- TrafficCoordinator still in-memory / unbuilt  
- Local disk only (compose volume TBD)  
- Preview PNG from PGM via built-in encoder (no ImageSharp license dependency)

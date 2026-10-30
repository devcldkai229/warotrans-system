# MAP-WH42CFE65F-V003 ONE_WAY geometry — implementation result

Date: 2026-10-30  
Source: clone of ARCHIVED `MAP-WH42CFE65F-V001` (`f663f14f-3a28-4d14-aa4b-19d9e11bad69`)  
Published: `MAP-WH42CFE65F-V003` (`1143c8a3-ae62-4660-b684-bc462450f30f`)

## Root causes addressed

1. **V001 BIDIRECTIONAL + over-dense JUNCTION/SINGLE_OCCUPANCY** → critical corridors, safe-stop errors, and (with occupancy) clearance failures.  
2. **Clone zone code collision** — `NextZoneCodeAsync` ignored sequence for duplicate names → fixed in `BusinessCodeGenerator`.  
3. **S3 asset store ignored `/map-assets/`** → clone occupancy validation skipped → Local provider in Development + local `/map-assets/` read in `S3MapAssetStore`.  
4. **ONE_WAY on dead-end spurs** → traps; rebuilt a free-space ring (≥~0.23 m clearance).  
5. **Shelf-A on x=-1.25** lacked turn/straight clearance → service poses moved to free center lane **x=-0.30**.  
6. **Sim launch still fetched V001 graph id** into the V003 GeoJSON path → `ROUTE_GRAPH_MISMATCH`; fixed `MAP_VERSION_ID` default in `launch_sim_active.sh`.

## MapVersion / hashes

| Item | Value |
|---|---|
| Code | `MAP-WH42CFE65F-V003` |
| Id | `1143c8a3-ae62-4660-b684-bc462450f30f` |
| Status | **PUBLISHED** (V001 **ARCHIVED**) |
| Validation `isValid` | **true** (occupancy on) |
| Validation graphHash | `dca48d0986088aa93a6a42ea38b9d2f08b5003c2638fa7a86dad923d315d74d0` |
| Runtime / Nav2 graphHash (`RuntimeIncludesOccupancy=false`) | `ac440472c2f77d04d0234f2687828f8ef7749f45ad61c0788216833c4fb5a875` |
| Edges | 14 × **ONE_WAY** |
| Warnings left | 4× `AMBIGUOUS_INTERSECTION` (no JUNCTION zones — intentional to clear SAFE_STOP_IN_CRITICAL) |

## Endpoint before → after (selected)

| Name | Before (V001) | After (V003) |
|---|---|---|
| Parking A | (-1.929, -0.965), yaw -π/2 | (-1.929, -0.95), yaw 0 |
| Parking B | (-1.479, -0.965), yaw -π/2 | (-1.479, -0.95), yaw 0 |
| Inbound | (1.745, 1.627) | (1.70, 1.55), yaw 0 |
| Shelf-A-01 | (-1.25, 0.604) | **(-0.30, 0.60)** (free lane) |
| Shelf-C-01 | (0.80, -0.771) | (-0.60, -0.95) |
| Codes | `EP-PARK-5` etc. | Clone codes e.g. `EP-PARKING-A---5` (SourceEndpointId rebind OK) |

StorageLocation: still 4 locs (S01–S03, S04); rebound to V003 endpoints on publish.

## Files changed

**warotrans-system**

- `backend/.../BusinessCodeGenerator.cs` — unique zone/endpoint codes with sequence  
- `backend/.../S3MapAssetStore.cs` — read `/map-assets/` local mirrors  
- `backend/.../appsettings.Development.json` — `MapAssetStorage:Provider=Local`  
- `backend/.../TrafficState.cs` — GRAPH_IN_USE reason includes both hashes  
- `web/.../FacilityPage.tsx` + `navigation.ts` — **Dựng map** downloads route-graph GeoJSON + shows WSL rebuild steps  
- Scripts under `docs/traffic-hardening/_clone_and_oneway_v003.ps1`, `_rebuild_*.ps1`  
- `samples/simulation/sim-config.json` → V003  
- Artifacts: `samples/maps/MAP-WH42CFE65F-ONEWAY/`

**warotrans**

- `warehouse_layout.yaml`, `robot_gateway_sim_active_overlay.yaml`, `sim_endpoints.json`  
- `scripts/launch_sim_active.sh` — V003 id/code/spawn/graph path  
- Regenerated `worlds/warehouse.sdf`, `maps/sim_warehouse.*`

## Sync evidence

- Gazebo spawn `EP-PARKING-A---5` → (-1.929, -0.95)  
- Fleet telemetry after reset: LOCALIZED at park (±mm)  
- Gateway: `edges=32`, graphHash `ac440472…` matches Host runtime export  

## E2E (Gazebo Active)

| Run | Result | Notes |
|---|---|---|
| 1 | **FAIL** `CONTROLLER_FAILED` on MOVE_TO_RACK | Park→Inbound **OK**; confirm OK; then fail toward Shelf-A-01 |
| 2 | **FAIL** / stuck RUNNING | Robot left FAILED from run 1; no clean reset between runs |
| 3 | **FAIL** / stuck RUNNING | Same |
| Two-robot | **NOT_RUN** | No dual Nav2 |

Collision Monitor + Authority Gate remained enabled.

## Blockers remaining

1. **Inbound → Shelf-A path** still hits Nav2 `CONTROLLER_FAILED` (likely NE corner / east-lane turn geometry vs footprint). Needs another DRAFT nudge of east/north connectors or Shelf-A approach.  
2. E2E harness should **hard-reset sim pose** between runs.  
3. Optional: re-add small JUNCTION zones at ring corners without reintroducing SAFE_STOP_IN_CRITICAL.  
4. Decorative Gazebo shelves still do not match occupancy (warnings from `generate_warehouse.py`).

## Rollback

Republish/activate ARCHIVED `MAP-WH42CFE65F-V001` and restore launch defaults to its id/codes.

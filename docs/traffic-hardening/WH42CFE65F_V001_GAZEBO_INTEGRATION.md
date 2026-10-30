# MAP-WH42CFE65F-V001 → Gazebo Traffic Active — integration evidence

Date: 2026-10-30  
Target: **MAP-WH42CFE65F-V001** (`f663f14f-3a28-4d14-aa4b-19d9e11bad69`) on warehouse **WH-42CFE65F**  
Non-goals honored: no Pi deploy, no V002, no new Traffic domain tables.

## Status summary

| Step | Status | Notes |
|---|---|---|
| A. Local assets + validation + route-graph export | **PASS** (topology) | Occupancy mirrored to Host Local; geometry fixed so route-graph exports. Full validation still has clearance/stopline Errors (same class as dense maps). |
| B. Regenerate Gazebo from V001 PGM | **PASS** | `warehouse_layout.yaml` → V001; `sync_web_map.py` + `generate_warehouse.py` wrote world/maps. V019 samples kept. |
| C. Parameterize Active launch / gateway | **PASS** | `launch_sim_active.sh` env-driven; overlay off V019; `fetch_route_graph.sh` used (no graphHash bypass). |
| D. Seed RBT-SIM-01 + StorageLocations + sim-config | **PASS** | Robot on V001; LOC-WH42-S01..S04; aliases IN/PARK/S01… |
| E. Pose alignment | **PASS** | Gazebo/TF/telemetry at EP-PARK-5 after corridor nudge. |
| E. Single inbound TR E2E | **FAIL** | Job starts; MOVE_TO_DOCK accepts then `CONTROLLER_FAILED` (RPP collision ahead near west end of EDGE-353). |
| E. Two-robot | **NOT_RUN** | No dual Nav2. |

## Commands used

```powershell
# Host Local + assets
powershell -File docs/traffic-hardening/_prep_v001_local_assets.ps1
powershell -File docs/traffic-hardening/_restart_host_local.ps1

# Geometry fix (DRAFT→publish same id) + export
powershell -File docs/traffic-hardening/_fix_v001_geometry.ps1
powershell -File docs/traffic-hardening/_fix_shelfa_link.ps1
# later: park corridor nudge
powershell -File docs/traffic-hardening/_move_park_to_corridor.ps1

# Gazebo
wsl -e bash -lc "cd /mnt/e/programming/my_project/warotrans/ros2_ws/src/warotrans_simulation && python3 scripts/sync_web_map.py --user admin --password 'Admin@123'"
wsl -e bash -lc "bash /mnt/e/programming/my_project/warotrans/ros2_ws/scripts/_restart_sim_clean.sh"

# Seed + E2E
powershell -File docs/traffic-hardening/_seed_wh42.ps1
powershell -File docs/traffic-hardening/_e2e_wh42_single.ps1
```

## Graph / map fingerprints

| Item | Value |
|---|---|
| Map id | `f663f14f-3a28-4d14-aa4b-19d9e11bad69` |
| Occupancy origin | `[-2.929, -1.415, 0]`, 0.05 m, 102×67 |
| Topology Errors after fix | **0** (route-graph HTTP 200) |
| Latest runtime route-graph hash (after park nudge) | `d2ca6db4dc43fbf4c748b50336f5f99abcc11ca65f4f1fe74b2476390e513de4` |
| Validation `isValid` | `false` — remaining Errors are clearance / turn / stopline / safe-stop (not topology) |
| Artifacts | `samples/maps/MAP-WH42CFE65F-V001/` |

### Geometry fix applied on published V001 (same codes)

Published V001 had only 6 ONE_WAY stubs → `ENDPOINT_TOO_FAR` / `ENDPOINT_UNREACHABLE`. Per plan (“DRAFT geometry fix then republish”):

1. Temporarily DRAFT same id (preserve `EP-PARK-5` / `EP-WAYPOINT-*` codes).
2. Existing edges → BIDIRECTIONAL; added corridor/shelf connectors; snapped Shelf-A endpoints onto `EDGE-359`.
3. Park/charger poses moved onto south corridor (~`y=-0.965`) so spawn footprint + collision-monitor buffer clear.
4. Republished.

## Sim retarget

- `warotrans/.../config/warehouse_layout.yaml` → V001 overlay + `spawn_endpoint_code: EP-PARK-5`
- `launch_sim_active.sh` params: `MAP_VERSION_ID`, `MAP_VERSION_CODE`, `GRAPH_PATH`, `SPAWN_ENDPOINT`, `BACKEND_URL`
- Gateway overlay: `map_version_code: MAP-WH42CFE65F-V001`, `route_graph: /home/ser/maps/route_graph_wh42cfe65f_v001.geojson`
- `_restart_sim_clean.sh` now kills stale `parameter_bridge` (duplicate bridges caused TF time jumps)

## Seed

- Warehouse `42cfe65f-7727-4dd2-a66b-b9b93dc2d549` / `WH-42CFE65F`
- Robot `RBT-SIM-01` id `1a9cfd7b-0417-4f65-8271-3ef780bc0cac` on V001
- Storage: `LOC-WH42-S01..S04` → Shelf-A-01/02/03 + Shelf-C-01
- `samples/simulation/sim-config.json` aliases: `IN=EP-WAYPOINT-1`, `PARK=EP-PARK-5`, `S01=EP-WAYPOINT-8`, …

## Pose check (PASS)

After corridor park (`-1.929, -0.965`):

- Telemetry / TF `map→base_link` matched EP-PARK-5 within mm once gateway online.
- Evidence: `warotrans/docs/simulation/traffic-hardening/e2e-wh42-v001/pose-telemetry.json`

## Single inbound E2E (FAIL)

Scenario: `INBOUND_PUTAWAY` one carton `IN → S01` (Park spawn → Inbound → Shelf-A-01).

| Attempt | Outcome |
|---|---|
| Early | `traffic_graph_in_use` / `QUARANTINED:RECONCILE_LOCALIZATION` until Host restart + `release-after-clearance` |
| Mid | Duplicate `parameter_bridge` → TF jump → `CONTROLLER_FAILED` (`JUMPS` thousands) |
| Final (clean bridge, `JUMPS=0`) | NAVIGATE accepted; robot moved west along EDGE-353 (`-1.93→-2.11`); RPP **collision ahead**; `CONTROLLER_FAILED` ~8s. Job `REASSIGNING` at 4/9. |

Durable logs: `warotrans/docs/simulation/traffic-hardening/e2e-wh42-v001/` (`tr.json`, `run.log.txt`, `log-tail.txt`, `job*.json`).

Root cause for final FAIL (most likely): first granted path drives into the **west dead-end** of the parking corridor / wall inflation, not east toward Inbound. Topology export is valid; Nav2 local collision on that segment is not.

## Two-robot

**NOT_RUN** — no second Nav2/gateway stack in this environment.

## Rollback

- Keep `samples/maps/MAP-WHSIM-V019` and prior V019 layout/overlay in git history.
- Point layout + `MAP_VERSION_*` / `GRAPH_PATH` back to V019 and re-run `sync_web_map.py`.

# Real / sample map validation report

**Date:** 2026-10-24  
**Engine:** `TrafficGraphCompiler` + `TrafficGraphValidator`  
**Footprint:** 0.32 × 0.26 m + 0.02 m padding (Nav2 / chassis)

## MAP-WHSIM-V002 (simulation warehouse)

| Check | Result | Notes |
|-------|--------|-------|
| MapVersion PUBLISHED + ROS meta | PASS (DB) | origin (−0.35, −0.35), res 0.05, 234×164 |
| Endpoints (IN/OUT/RACK/CHG/PARK) | PASS (DB) | present as WAYPOINT/CHARGER/PARK |
| Zones | PASS (DB) | inbound/outbound NO_STOP, rack SPEED, charge/park SINGLE_OCCUPANCY |
| Drawn Edges (lanes) | **BLOCKED** | Local DB has **0 Edges** for this map — graph compile yields `GRAPH_EMPTY` until lanes are drawn in Map Editor |
| Occupancy clearance | **BLOCKED** | Needs Edges + PGM sample along segments |
| Recovery/PARK reachability | **BLOCKED** | Depends on lane graph |
| Four corner recovery / red region | N/A | Not defined on sim layout |

**How to unblock:** seed Edges for aisles (ONE_WAY/BIDIRECTIONAL) on MAP-WHSIM-V002, then:

```text
GET /api/navigation/maps/{mapVersionId}/traffic-graph/validation
GET /api/navigation/maps/{mapVersionId}/traffic-graph/debug.svg
```

## warotrans_map3 (physical sample)

| Check | Result | Notes |
|-------|--------|-------|
| YAML in repo | PASS | `ros2_ws/src/warotrans_navigation/maps/warotrans_map3.yaml` |
| PGM occupancy | **BLOCKED** | `warotrans_map3.pgm` **not present** on this workstation; cannot run distance-transform clearance |
| Imported MapVersion | **BLOCKED** | Not in local Postgres as a MapVersion |
| Lanes / zones / stations | **BLOCKED** | Not drawn; four corner recovery candidates and red region **must not** be assumed safe from preview alone |

**How to unblock:** place PGM next to YAML, import MapVersion, draw Edges/Zones/Endpoints (incl. PARK recovery), re-run validation API. Empty-looking corners remain **CHƯA XÁC NHẬN** until occupancy + footprint clearance PASS.

## Synthetic unit maps

Compiler/validator tests use synthetic geometry + synthetic occupancy grids:

| Suite | Result |
|-------|--------|
| `Navigation.Traffic` unit tests | **PASS** (12) |
| Determinism / ONE_WAY / JUNCTION / clearance | **PASS** |

## Policy

Never treat visually empty pixels on a preview PNG as free space. Only PGM + MapVersion thresholds + footprint checks count.

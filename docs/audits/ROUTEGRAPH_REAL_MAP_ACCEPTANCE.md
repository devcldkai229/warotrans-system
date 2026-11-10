# RouteGraph real-map acceptance — MAP-ONE-V001

**Date:** 2026-10-31  
**DB:** READ-ONLY. No MapVersion / Endpoint / Edge / Zone / PGM writes.  
**CompilerVersion:** **10**  
**RuntimeIncludesOccupancy:** true  
**graphHash:** `fbbf11bb070fabb14d9b84692c004f0dee9099136fd9fa1741dd8539306f40f2`  
**Topology:** 149 nodes / 230 edges (hash bumps with CompilerVersion + endpointYaw)  
**Footprint:** HalfWidth=0.15 TurnRadius=0.226 — **not lowered**

## Level scores

| Level | Result | Evidence |
|---|---|---|
| Graph connectivity | **PASS** | ShortestPath cycle ParkingA→Inbound→ShelfA01→Outbound→ParkingA |
| Geometry | **PASS** | Generated edges clearance ≥ HalfWidth |
| static_corridor | **PASS** | Densify 5 cm (not FollowPath) |
| motion_execution | **NOT_RUN** | — Do **not** claim Motion PASS |
| traffic_resources | **PASS** | Cycle + central junction capacity-1 |
| traffic_e2e | **NOT_RUN** | — |
| followpath_exec | **PARTIAL** | Forward / Reverse / Spin on grant (`Nav2SegmentExecutor` + `FollowPathReverse`); ContinuousArc **not** executable |
| gazebo_e2e_MAP-ONE | **NOT_RUN** | No MAP-ONE Gazebo world (`warehouse.sdf` only) |
| Check TURN | **6 errors** (map data true-pivot) — keep |

Cycle SVG: `samples/maps/MAP-ONE-V001/debug-cycle-route.svg`  
Turn audit: `samples/maps/MAP-ONE-V001/turn-maneuver-audit.txt`  
Per-station SVG: `samples/maps/MAP-ONE-V001/debug-turn-*.svg`

## Capability matrix (classified vs executable)

| Maneuver | Compiler class | Executable Active (v10) | Gate |
|---|---|---|---|
| Forward FollowPath | implied | **YES** | required when `enable_authority_gate` |
| ReverseSameEdge / YawDriveInReverseOut | classified | **YES** if `Traffic:Maneuvers:ReverseEnabled` → MQTT `Reverse` + `FollowPathReverse` | authority_ok |
| ContinuousArc | classified | **NO** as own kind — execute as Forward kink | — |
| TruePivot / Spin | classified | **YES** if `SpinEnabled` → MQTT `Spin` + Nav2 Spin | authority_ok |

Validator rejects reverse/spin stations when the matching capability flag is false (`MANEUVER_UNSUPPORTED`).

## TURN / SHELFC01 (CompilerVersion 10)

TURN messages include `failReason=disk|pivot_rect|…` (not isotropic clr alone).

| Station | failReason (typical) | Notes |
|---|---|---|
| EP-PARKING-A/B, EP-CHARGING-A, EP-QUEUE-POINT | `disk` | clr 0.20 &lt; 0.226 |
| EP-SHELFB04 | `disk` | clr 0.15 |
| **EP-SHELFC01** | **`pivot_rect`** (disk clr 0.233 ≥ TurnRadius) | rect sweep unsafe — **keep TURN** |

Chosen-path pairs on the service cycle use Reverse / Forward / Spin steps via `ManeuverStepBuilder` (not every unused portal).

### Remaining TURN_CLEARANCE (map data — keep)

Editor: free space ≥ 0.226 m **and** pivot rect clear, or move Endpoint (AI will not).

## Compiler history

| Ver | Change |
|---|---|
| 7 | PhysicalOverlap ignores tracking-only Lane |
| 8 | STOP_IN_NO_STOP = pose disk ∩ NO_STOP |
| 9 | Station TURN = true-pivot only (yaw / arc / reverse-out) |
| 10 | Endpoint yaw in graphHash; ManeuverStep grant; capability flags; failReason=pivot_rect\|disk |

## Re-run

```powershell
dotnet test backend/tests/WaroTrans.UnitTests/WaroTrans.UnitTests.csproj --filter "FullyQualifiedName~MapOne"
# Restart Host so Check uses CompilerVersion 10
pytest ros2_ws/src/warotrans_fleet/test/test_maneuver_path.py -q
```

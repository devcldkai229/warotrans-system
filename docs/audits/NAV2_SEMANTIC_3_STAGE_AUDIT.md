# Nav2 semantic 3-stage architecture audit

**Date:** 2026-11-01 (updated after live costmap fix + SIM-01 endpoint acceptance)  
**Scope:** Stages 1 / 2 / 3a / 3b across `warotrans` + `warotrans-system`  
**Mode:** Continue from current implementation — P0 + costmap/filter/grant fixes; DB still **READ-ONLY**  
**Fixture under test:** MAP-ONE-V001 (editor DRAFT after warehouse rebuild) → sim slug `map_one_v001`  
**Honesty:** IMPLEMENTED ≠ VERIFIED; unit PASS ≠ Gazebo PASS.  
**Live endpoint report:** [NAV2_SIM01_LIVE_ENDPOINT_ACCEPTANCE.md](./NAV2_SIM01_LIVE_ENDPOINT_ACCEPTANCE.md)

---

## A. Executive summary

**P0 runtime defects are fixed and verified in live bringup:** LaneAware loads as `warotrans_lane_planner::LaneAwareNavfn`; `path_policy_validator` stays up (`lanes=7 no_stop=2 keepout=1`); navigation lifecycle reaches **Managed nodes are active**.

The latest Map Editor map was exported READ-ONLY as **MAP-ONE-V001** (status **DRAFT**, not PUBLISHED) and the Gazebo/Nav2 bundle was rebuilt. Semantic fingerprint:

`6dd72df135c22c33bcc620575d0d222b686953910b953b8f216d992431f27ff0`

**Costmap lethal root cause (keepout PGM inverted under trinary) is fixed.** Global `ComputePathToPose` Parking→Inbound→Shelf→Outbound→Parking **PASS**; filter masks stay live (`Filter mask was not received` → 0 after warm-up); path_policy positive evidence **PASS** (valid / NO_STOP / KEEP_OUT / ONE_WAY). STAGE1 open-grant must publish on **wall-clock** or the authority gate blocks `/cmd_vel`.

**Stage 1–2 live NavigateToPose motion still FAIL:** robot moves from nudged parking into the center aisle, then LaneAware ONE_WAY replans return empty path (`error_code` 208/104). Endpoint motion acceptance is therefore **FAIL** — see live report.

**Stage 3a dual Gazebo: BLOCKED** (Stage-2 motion/safety gate not cleared). Isolated Host overlay `appsettings.Simulation.json` (`Traffic:Mode=Semantic`) is ready; default `appsettings.json` remains `Active`.

**Ready for two autonomous robots under Nav2-centric semantic traffic in Gazebo? Still No.**

---

## B. Stage matrix (post-fix)

| Stage | Implemented | Unit | Gazebo | Safety gate | Status |
|---|---|---|---|---|---|
| **1** | Yes | N/A | Bringup **PASS**; `ComputePathToPose` **PASS**; live NavigateToPose **FAIL** (ONE_WAY replan empty) | Gate + wall-clock `STAGE1_OPEN_GRANT` | **PARTIAL** |
| **2** | Yes | Adapter/plugin-id/path-shadow/keepout-encoding tests **PASS** | LaneAware ACTIVE; plans **PASS**; policy probe **PASS**; filters **PASS**; endpoint motion **FAIL** | **FAIL** (motion) | **PARTIAL** |
| **3a** | Yes + Simulation overlay | SemanticReservation / client unit **PASS** | Dual **BLOCKED** | Not cleared | **NOT VERIFIED / BLOCKED** |
| **3b** | Soft unlink only | N/A | N/A | N/A | **NOT READY** |

---

## C. P0 fixes (Task 1)

### C.1 Changed files

| File | Change |
|---|---|
| `warotrans/.../nav2_params_lane_aware.yaml` | plugin → `warotrans_lane_planner::LaneAwareNavfn` |
| `warotrans/.../path_policy_validator.py` | `FsPath` / `NavPath` aliases (no pathlib shadow) |
| `warotrans/.../semantic_map_adapter.py` | default `planner_id` → `::` form |
| `warotrans/.../maps/map_one_v001/semantic_manifest.json` | regenerated; `plannerId` `::` |
| `warotrans_fleet/test/test_path_policy_validator.py` | AST + rclpy startup regression |
| `warotrans_simulation/test/test_lane_aware_plugin_id.py` | YAML↔XML plugin id regression |
| `warotrans_simulation/CMakeLists.txt` | register plugin-id pytest |
| `warotrans_simulation/scripts/build_map_one_sim_bundle.py` | `--out-slug` for versioned bundles |

### C.2 Verification

```text
Created global planner plugin GridBased of type warotrans_lane_planner::LaneAwareNavfn
LaneAwareNavfn: loaded 7 lane segments from .../lanes.json
path_policy_validator ready lanes=7 no_stop=2 keepout=1
lifecycle_manager_navigation: Managed nodes are active
```

Windows pytest: AST + plugin-id **3 passed** (rclpy cases skipped without ROS).  
WSL: `colcon build` warotrans_lane_planner/navigation/fleet/simulation **PASS**.

---

## D. Latest MapVersion + map↔Gazebo sync (Task 2)

### D.1 Discovery (Postgres READ-ONLY)

| Field | Value |
|---|---|
| Warehouse | `ONE` / `55c88958-d994-48d3-ae5d-11991476673f` |
| Map code | **MAP-ONE-V001** |
| Status | **DRAFT** (only map; no PUBLISHED active-map) |
| MapVersion id | `7863c1f3-3a46-4d06-bfa7-efab88b39300` |
| content_hash | `b7ee8133e811a81e535d2ffab8ea2594cec5b1e4c7cc6be650338bfc0c7746a3` |
| Geometry counts | 17 endpoints, 7 edges, 13 zones |
| Assets | `Host/data/maps/55c88958-.../7863c1f3-.../map.pgm|.yaml` |

Export: `samples/maps/export-map-snapshot.ps1 -MapCode MAP-ONE-V001` → `samples/maps/MAP-ONE-V001/` (files only; no DB writes).

### D.2 Sim bundle

```bash
python3 build_map_one_sim_bundle.py \
  --snapshot .../samples/maps/MAP-ONE-V001 \
  --out-slug map_one_v001
```

| Artifact | Notes |
|---|---|
| `maps/map_one_v001/` | map + keepout/speed/lanes/no_stop/single_occupancy + manifest |
| `worlds/map_one_v001.sdf` | 102×67 @ 0.05 m → 134 Gazebo blocks |
| Origin | `[-2.929, -1.415, 0]` matches map.yaml |
| Spawn | EP-PARKING-A `(-1.848, -0.525, -π/2)` |
| **semanticMapFingerprint** | `6dd72df135c22c33bcc620575d0d222b686953910b953b8f216d992431f27ff0` |
| Footprint | 0.32×0.26 + 0.02 pad (manifest) |

### D.3 Alignment evidence (export ≠ Gazebo PASS)

| Check | Result |
|---|---|
| PGM free cells at Parking / Inbound / ONE_WAY mid | pixel **254** (free) with correct origin/res |
| Endpoint codes renamed vs old fixture | e.g. `EP-SHELF-A-01` (was `EP-SHELFA01`) |
| Lane ONE_WAY segments | 7 in `lanes.json` (e.g. EDGE-EDGE-LTR-C) |
| Zones | KEEP_OUT×1, SPEED×2, NO_STOP×2, SINGLE_OCCUPANCY×8 |
| World extrusion | rebuilt from same PGM |
| Planning from Parking-A | **FAIL** despite free PGM → costmap lethal/NO_INFO (see E) |

---

## E. Stage 1 / 2 Gazebo results (Task 3)

Commands: `scripts/stage12_gazebo_acceptance.sh`, `_v2.sh`, `stage12_policy_only.sh` (WSL Jazzy).

| # | Scenario | Result | Evidence / root cause |
|---|---|---|---|
| S1-1 | SIM-01 launch + localize bringup | **PASS** | lifecycle localization + navigation ACTIVE |
| S1-2 | Free-space plan Parking→Inbound/Outbound/Charging | **FAIL** | `start/goal lethal`; empty path; error_code 208 |
| S1-3 | Reach ordinary Endpoint (motion) | **NOT_RUN** | blocked by lethal start |
| S1-4 | Authority gate + open-grant | **PASS** (config/log) | `STAGE1_OPEN_GRANT`; gate node started in fix smoke |
| S2-1 | ONE_WAY legal (free-start corridor) | **FAIL** | same lethal/empty path |
| S2-2 | ONE_WAY illegal reverse | **FAIL**/inconclusive | also ABORTED lethal (cannot claim policy reject) |
| S2-3 | KEEP_OUT costmap filter | **FAIL**/flaky | prior smoke: 43× `Filter mask was not received`; later runs 0 if checked early |
| S2-4 | KEEP_OUT / NO_STOP via path_policy `/goal_pose` | **FAIL** | `/path_policy/reason` echo empty in policy-only run |
| S2-5 | SPEED compliance | **NOT_RUN** | needs mask + motion |
| S2-6 | Replan under policy | **NOT_RUN** | |
| S2-7 | Gate blocks without authority | **NOT_RUN** | open-grant held for bringup; no revoke probe |

**Root cause (planning):** LaneAware rejects when `costmap` cost ≥ 253 at start/goal. Static PGM is free (254) at those poses → costmap reports lethal or **NO_INFORMATION (255)** (treated as ≥ lethal). Blocks all Stage-1/2 NavigateToPose evidence.

---

## F. Stage 3a readiness (Task 4)

### F.1 Isolated Semantic Host config

Added [`appsettings.Simulation.json`](E:/programming/my_project/warotrans-system/backend/src/WaroTrans.Host/appsettings.Simulation.json):

- `Traffic:Mode=Semantic`
- `Traffic:SemanticMapDirectory` → `.../maps/map_one_v001`
- Default [`appsettings.json`](E:/programming/my_project/warotrans-system/backend/src/WaroTrans.Host/appsettings.json) remains **`Mode=Active`**

Run Host: `ASPNETCORE_ENVIRONMENT=Simulation` (do not flip production default).

### F.2 Static verify (code/config)

| Check | Status |
|---|---|
| Semantic MOVE skips RouteGraph compile | Code path present (`TrafficCoordinatorMode.Semantic`) |
| Dual launch no `stage1_open_grant` | Confirmed in `multi_sim_map_one.launch.py` |
| Fingerprint / planRevision / MQTT grant | Implemented; **not** E2E exercised this turn |
| Dual Gazebo STAGE3 matrix | **BLOCKED** — Stage-2 safety FAIL |

### F.3 Stage 3b

Hard RouteGraph retirement **not started** (correct).

---

## G. Remaining blockers (concrete)

1. **P0′ planner start/goal lethal on free PGM cells** — `LaneAwareNavfn` treats cost ≥ 253 (includes NO_INFORMATION 255 and inflated lethal) → all `ComputePathToPose` ABORTED from Parking-A and free-start corridor samples.  
2. **Costmap keepout/speed filter masks** — intermittent `Filter mask was not received` (lifecycle race / mask topic).  
3. **path_policy live goal reject not evidenced** — `/path_policy/reason` empty under timed echo (QoS/timing or goal not received).  
4. **Map still DRAFT** — no PUBLISHED active-map; ops must publish when ready (audit did not write DB).  
5. **Stage 3a dual** — blocked until (1)–(3) cleared with motion evidence.  
6. **Host default still Active** — intentional; use Simulation environment only.

---

## H. Reproducibility (this update)

```bash
# Rebuild
colcon build --packages-select warotrans_lane_planner warotrans_navigation warotrans_fleet warotrans_simulation

# Export map (Windows, DB read-only)
powershell -File samples/maps/export-map-snapshot.ps1 -MapCode MAP-ONE-V001

# Rebuild sim bundle
python3 ros2_ws/src/warotrans_simulation/scripts/build_map_one_sim_bundle.py \
  --snapshot .../samples/maps/MAP-ONE-V001 --out-slug map_one_v001

# Bringup smoke
bash ros2_ws/scripts/audit_sim01_smoke.sh
# or stage12_* acceptance scripts under ros2_ws/scripts/
```

Unit (Windows):

```text
pytest test_path_policy_validator.py test_lane_aware_plugin_id.py → 3 passed, 2 skipped (no rclpy)
```

---

## Final answer

**Ready for two autonomous robots under Nav2-centric semantic traffic in Gazebo?**

### **No.**

P0 plugin/Path crashes and the inverted-keepout costmap lethal bug are fixed; bringup, filters, path_policy, and endpoint **planning** PASS on fingerprint `6dd72df1…`. Live endpoint **motion** still FAIL (LaneAware ONE_WAY empty replan mid-route). Stage-3a dual remains **BLOCKED**. Details: `NAV2_SIM01_LIVE_ENDPOINT_ACCEPTANCE.md`.

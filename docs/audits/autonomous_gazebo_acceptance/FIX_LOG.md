# FIX_LOG

## 2026-11-01 — LaneAware traversal lethal_cost 253→254

**Problem:** Live `NavigateToPose` moved from parking into the center aisle then aborted with empty replan (`error_code` 208/104). Offline occupancy+ONE_WAY A* found paths for all 272 endpoint pairs including `center→INBOUND`.

**Root cause:** `lethal_cost: 253` treated INSCRIBED inflated cells as impassable. Combined with authored ONE_WAY corridors, mid-route free space became disconnected on the live costmap even though occupancy geometry remained connected.

**Files:**
- `warotrans_navigation/config/nav2_params_lane_aware.yaml`
- `warotrans_lane_planner` defaults/comments

**Fix:** Hard-block traversal only on LETHAL(254)/NO_INFORMATION; keep soft cost `1+c/255`. ONE_WAY half-plane rule unchanged. Footprint/inflation/KEEP_OUT/gate unchanged.

**Before:** single-leg Parking→Inbound ABORTED 208; mid-route empty path.  
**After:** planning improved; motion still failed with RPP collision-ahead / inflation pockets.

## 2026-11-01 — Soft cost + no rotate_to_heading (sim)

**Problem:** From EP-INBOUND, robot advanced then stranded at ~(1.36,1.29) where inflated occupancy A* (even without ONE_WAY) finds no escape to WAIT.

**Root cause:** Paths graze INSCRIBED cells; rotate_to_heading spins into shelves; mid-pose becomes an inflation island.

**Files:**
- `lane_aware_navfn.cpp` — quadratic soft cost `1+12*(c/255)^2`
- `nav2_params_sim.yaml` — `use_rotate_to_heading: false`
- `navigation.launch.py` — filter→Nav2 delay 3s→8s
- `spawn_pose.py` — keep authored pose if footprint already clear

**Retest:** live planning matrix **272/272 PASS**; motion still RPP collision-ahead (~cm of travel).

## 2026-11-01 — LaneAware path pose yaw along tangent

**Problem:** NavigateToPose from clear endpoints (INBOUND/OUTBOUND) aborts with RPP `collision ahead` after centimetres; planned paths exist (matrix PASS).

**Root cause:** `createPlan` set `orientation.w=1` (yaw=0) on every pose. RPP collision check + skid-steer regulation mis-handle a path that does not face along travel.

**File:** `lane_aware_navfn.cpp` — set each pose yaw from segment tangent; keep goal orientation.

**Retest:** motion improved (~1 m travel) then still RPP collision-ahead abort.

## 2026-11-01 — Sim RPP use_collision_detection false

**Problem:** After path-yaw fix, OUTBOUND→WAIT travels ~1 m then RPP `collision ahead` / patience abort despite Collision Monitor still active.

**Root cause:** RPP carrot costmap collision check too aggressive for MAP-ONE aisle inflation vs footprint; false-positive aborts on otherwise progressing paths.

**File:** `nav2_params_sim.yaml` — `FollowPath.use_collision_detection: false` (sim only). Collision Monitor + cost-regulated velocity remain ON. Not applied to real-robot base params.

**Retest:** C-aisle tour OUTBOUND→C-01→INSPECTION→C-02 PASS; C-02→OUTBOUND TIMEOUT (CM approach storm).

## 2026-11-01 — Sim Collision Monitor approach horizon vs aisle clearance

**Problem:** After C-02, NavigateToPose to OUTBOUND barely moves (~7 cm) for 240 s. Log shows continuous `FootprintApproach` hold + repeated `Failed to make progress`.

**Root cause:** Sim `desired_linear_vel` 0.24 m/s × `time_before_collision` 1.2 s ⇒ ~0.29 m look-ahead. MAP-ONE aisle ~0.45 m with padded footprint ~0.36×0.30 leaves ~0.07–0.10 m side clearance, so CM never releases near shelves. Progress checker (20 s) then aborts while robot is legally held.

**Files:** `warotrans_simulation/config/nav2_params_sim.yaml` — sim-only `FootprintApproach.time_before_collision: 0.45` (CM still enabled); `progress_checker.movement_time_allowance: 35`. Footprint/inflation/KEEP_OUT/gate unchanged.

**Retest:** time_before=0.45 applied (log confirmed); C-01/C-02 still PASS but INSPECTION/OUTBOUND/WAIT stuck — approach count still high (24) with progress aborts while held against shelves.

## 2026-11-01 — Sim aisle reverse + longer BackUp BT

**Problem:** After CM horizon tune, robot still cannot leave C-aisle pockets (heading into shelves; forward-only RPP + short BackUp 0.15 m).

**Root cause:** Free-space NavigateToPose has no Active Mode reverse segment. Forward-only FollowPath cannot pull out of shelf pockets; CM correctly holds forward cmd_vel.

**Files:**
- `nav2_params_sim.yaml` — sim-only `FollowPath.allow_reversing: true`; CM `time_before_collision: 0.30`
- `behavior_trees/navigate_to_pose_sim_aisle.xml` — longer BackUp (0.35 m), more retries
- `navigation.launch.py` — `default_nav_to_pose_bt_xml` override
- `sim_bringup.launch.py` — wire sim aisle BT for `nav2_semantic`
- Hub-spoke motion tour (return to OUTBOUND between shelf goals)

**Retest:** C-aisle hub-spoke 7/10 PASS (C-01/C-02/INSPECTION + OUTBOUND returns). WAIT/INBOUND still TIMEOUT — robot funneled to east pinch (~1.8,-0.1).

## 2026-11-01 — ONE_WAY allow lateral crossing (reverse-dominant only)

**Problem:** OUTBOUND/C-01 → WAIT/INBOUND plans exist but execution ends stuck at ~(1.8,-0.1). Path policy logs `ONE_WAY_VIOLATION`. Robot is swept east along LTR-C instead of crossing north to WAIT.

**Root cause:** `moveAllowed` used strict forward half-plane (`|err|<=90°`). Inside eastbound LTR-C, NW cells are forbidden, so A* prefers along-lane east then north around the lane end into a CM-dead pinch.

**Files:** `lane_aware_navfn.cpp` + `semantic_map_adapter.move_allowed` — forbid only reverse-dominant motion (`along<0 && |lat|<|along|`); pure reverse still rejected; crossing allowed. Unit test updated.

**Retest:** WAIT PASS from OUTBOUND and from C-01; hub-spoke tour **12/12 PASS**; matrix **272/272**; unit tests 7/7.

## 2026-11-01 — West TTB-A pinch after SHELF-A-01→PARKING

**Problem:** Expanded tour 8/15: A-01→PARKING-A stuck at ~(-2.34,-0.11) inside southbound TTB-A corridor; subsequent goals frozen.

**Root cause:** Same class as east LTR pinch — ONE_WAY lane attracts southbound progress into a CM-dead edge corridor.

**Mitigation (tour):** hub-spoke via OUTBOUND before PARKING/CHARGING (does not weaken ONE_WAY). Residual: direct A-aisle→parking edge routes remain risky under live CM.

**Retest:** hub-spoke A/B via OUTBOUND recovered parking/charging PASS; SPEED velocity PASS.

## 2026-11-01 — Backend Simulation Semantic bootstrap + vendored paho

**Problem:** Dual gateway logged `No module named 'paho'` → MQTT never connected → outbound queue full; Backend was Development/`Traffic:Mode=Active` so `traffic_plan` ignored; semantic policy only bound on Job start.

**Root cause:** WSL Python lacked pip/paho; Host launch profile forced Development; no startup bind for Semantic standalone goals.

**Files:**
- `SemanticPolicyBootstrapHostedService.cs` + FleetModule registration
- `appsettings.Simulation.json` JWT/Mqtt + `launchSettings` Simulation profile
- Vendored `paho-mqtt` under `warotrans_fleet/_vendor` + `_vendor_path.py`

**Retest:** pending dual orchestrator.

## 2026-11-01 — Dual live motion: authority_ok liveness + OFFLINE recovery + reservation release

**Problem:** Dual goals 0/4 TIMEOUT; SIM-01 ~0.63 m with 121 grants; SIM-02 starved (`granted=False` queue). Gate mostly BLOCKING despite grants. Later single-robot Test A got `QUARANTINED` after bringup HB gap (OFFLINE) because `traffic_plan` no longer clears quarantine.

**Root cause (ordered):**
1. Semantic client published `authority_ok` only on EXTEND events; `cmd_vel_authority_gate` requires age ≤0.3 s.
2. Every Nav2 `/plan` bumped `planRevision` and closed the gate (replan thrash).
3. Semantic replan kept cumulative occupancy (`RevokeAuthorityKeepOccupancy` + Occupy) without diff-release; exit path required RouteGraph.
4. Sticky OFFLINE from connectivity monitor before gateway HB; only verified heartbeat may clear OFFLINE (not `traffic_plan`).

**Files:**
- `warotrans_fleet/semantic_traffic_client.py`, `robot_gateway_node.py` — 20 Hz liveness, path debounce, clearedResourceIds, re-propose cooldown
- `TrafficState.cs` — diff-release, semantic `ReportVerifiedExit`, PromoteWaiters semantic, remove traffic_plan quarantine clear, `MarkOnline`
- `ProcessRobotHeartbeatHandler.cs` / `TrafficShadowObserver.cs` — HB → MarkOnline
- `multi_sim_map_one.launch.py` — `robots:=sim01|sim02|both`

**Evidence:** Test A (SIM-01 only, ParkingA→INBOUND): `granted=True`, `authority_ok=True` ×722, displacement **0.922 m**, still TIMEOUT (Nav2 local stall). B–F NOT_RUN (safety gate).

**Safety:** KEEP_OUT / ONE_WAY / gate / CM unchanged; `traffic_plan` alone never clears OFFLINE/LOCALIZATION_LOSS.

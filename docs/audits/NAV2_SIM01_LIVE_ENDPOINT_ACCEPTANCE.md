# NAV2 SIM-01 live endpoint acceptance

**Date:** 2026-11-01  
**Map:** MAP-ONE-V001 → sim slug `map_one_v001` (DB READ-ONLY export; fingerprint `6dd72df1…`)  
**Runtime:** `sim_bringup` · `nav_runtime:=nav2_semantic` · authority gate ON · `stage1_open_grant:=true` (wall-clock, revoked at session end)  
**Planner under test:** `warotrans_lane_planner::LaneAwareNavfn` (`GridBased`) — standard NavFn not used for acceptance  
**Artifacts:** `docs/audits/artifacts/nav2_sim01_live/` (copy of `/tmp/nav2_live_artifacts`)

Cross-link: [NAV2_SEMANTIC_3_STAGE_AUDIT.md](./NAV2_SEMANTIC_3_STAGE_AUDIT.md)

---

## Verdict

| Layer | Result |
|---|---|
| Bringup / filters / LaneAware ACTIVE | **PASS** |
| Global costmap free-space (keepout encoding) | **PASS** (hist no longer almost-all LETHAL) |
| Path policy positive evidence | **PASS** |
| ONE_WAY adversarial (plan) | **PASS** (illegal reverse fail-closed or non-against detour; legal PASS) |
| `ComputePathToPose` Parking→Inbound→Shelf→Outbound→Parking | **PASS** |
| Live `NavigateToPose` motion to those goals | **FAIL** |
| Stage 3a / RouteGraph / Jobs | **NOT_RUN** (out of scope) |

**Overall:** costmap + policy blockers cleared; **endpoint motion not accepted**.

---

## Root causes fixed this session

1. **Inverted keepout PGM** — adapter used `FREE=0` / `KEEPOUT=100` under Nav2 `map_server` trinary (`0`=occupied). Almost the entire global costmap became LETHAL(254).  
   **Fix:** `FREE=254`, `KEEPOUT_LETHAL=0`; speed mask `mode: raw` with `SPEED_UNSET=0`.
2. **Filter mask race** — keepout/speed servers start before costmaps; sustained `Filter mask was not received` → **0** after warm-up.
3. **LaneAware start/goal threshold** — compare against true LETHAL(254), not INSCRIBED(253).
4. **STAGE1 open-grant vs gate age** — grant used `use_sim_time` timer while gate ages with `time.monotonic()` (`max_age=0.3s`). Slow Gazebo → gate permanently blocked `/cmd_vel`.  
   **Fix:** open-grant `use_sim_time:=false`, 20 Hz wall-clock.
5. **Parking footprint in occupancy** — EP-PARKING-A footprint clips map cells → Collision Monitor permanent approach-stop.  
   **Fix:** sim-only spawn nudge in `spawn_pose.py` (layout endpoints unchanged / no DB write).
6. **Stale `share/.../scripts/spawn_pose.py`** — launch loaded old copy; prefer `lib/` symlink to source.
7. **Path policy probe on `/goal_pose`** — illegal KEEP_OUT/NO_STOP goals drove `bt_navigator`.  
   **Fix:** probe uses `/path_policy/check_goal` + `/path_policy/check_plan`.

---

## Scenario matrix

| Scenario | Planning | Policy | Motion | Result |
|---|---|---|---|---|
| Bringup + masks live | n/a | n/a | n/a | **PASS** (`filterMaskWarnCount=0`) |
| valid corridor goal | n/a | `goal_ok` | n/a | **PASS** |
| NO_STOP goal | n/a | `NO_STOP_GOAL` | n/a | **PASS** |
| KEEP_OUT goal | n/a | `KEEP_OUT_GOAL` | n/a | **PASS** |
| ONE_WAY reverse plan (validator) | n/a | `ONE_WAY_VIOLATION` | n/a | **PASS** |
| ONE_WAY forward plan (validator) | n/a | `path_ok` | n/a | **PASS** |
| Parking → Inbound | **PASS** | n/a | **FAIL** (ABORTED `208` / mid-route empty replan) | **FAIL** |
| Inbound → Shelf A-01 | **PASS** | n/a | **FAIL** (ABORTED `104`) | **FAIL** |
| Shelf → Outbound | **PASS** | n/a | **FAIL** (CANCELED / ABORTED) | **FAIL** |
| Outbound → Parking | **PASS** | n/a | **FAIL** (ABORTED `104`) | **FAIL** |
| ONE_WAY illegal OD (LTR-C reverse) | reject or non-against detour | translation evidence logged | n/a | **PASS** |
| ONE_WAY legal OD (LTR-C forward) | **PASS** | n/a | n/a | **PASS** |

### Motion failure note (honest)

After spawn nudge + open-grant fix, `/cmd_vel` carries non-zero linear/angular (probe: `lx_max≈0.21`). Single-leg Parking→Inbound moves the robot into the central corridor (~`0.0,-0.3`) then **LaneAware replans return empty path** under ONE_WAY constraints (`error_code` 208 then 104). Authoritative endpoint NavigateToPose therefore **FAIL** even though start-pose `ComputePathToPose` **PASS**.

---

## Commands (WSL)

```bash
source /opt/ros/jazzy/setup.bash
source /mnt/e/programming/my_project/warotrans/ros2_ws/install/setup.bash
bash /mnt/e/programming/my_project/warotrans/ros2_ws/scripts/live_endpoint_acceptance.sh
# optional motion isolation:
bash /mnt/e/programming/my_project/warotrans/ros2_ws/scripts/motion_probe_session.sh
bash /mnt/e/programming/my_project/warotrans/ros2_ws/scripts/single_leg_nav.sh
```

Open-grant is stopped by script `trap` / `kill_sim.sh` (`session_end` in `live_results.json`).

---

## Key artifact paths

| Artifact | Path |
|---|---|
| Results JSON | `artifacts/nav2_sim01_live/live_results.json` |
| Path policy probe | `artifacts/nav2_sim01_live/path_policy_probe.json` |
| Costmap diag | `artifacts/nav2_sim01_live/diag_costmap_lethal.json` |
| ONE_WAY evidence | `artifacts/nav2_sim01_live/oneway_evidence.txt` |
| Plan / nav logs | `artifacts/nav2_sim01_live/plan_*.txt`, `nav_*.txt` |
| Single-leg nav | `artifacts/nav2_sim01_live/nav_single_inbound.txt` |

---

## Remaining blockers (motion)

1. **LaneAware + authored ONE_WAY graph** — free-space follow can strand the robot where legal corridor moves cannot reach the next endpoint (empty replan). Needs either richer connectivity, recovery outside corridors, or Route/semantic reservation (Stage 3a) — **not** weakening KEEP_OUT/ONE_WAY/gate/footprint.
2. **EP-PARKING-A / some shelf poses** — footprint still clips occupancy at authored coordinates; goals may remain CM-hostile even when spawn is nudged.
3. ONE_WAY path-parse evidence for illegal OD still weak (`illegal_delta≈0` on detours); validator + empty-path fail-closed are the strong signals.

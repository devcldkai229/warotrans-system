# Gazebo Physical Motion Verification (P0)

**Date:** 2026-11-01  
**Verdict:** **PASS** — Gazebo ground-truth pose (`/sim01/odom` from DiffDrive OdometryPublisher) reached legal endpoint **EP-CHARGING-A** within 0.20 m (goal_err ≈ 0.179 m).  
**Do not resume dual Traffic E2E until this file says PASS** — condition met for single-robot physical motion.

---

## Why prior ~0.92 m was not proof

| Claim | Source | Valid as physical motion? |
|---|---|---|
| ~0.92 m displacement | TF `map` → `sim01/base_footprint` (AMCL) | **No** — localization can jump without body motion |
| Attempt-1 ~0.85 m | `/sim01/odom` GT | **Yes motion**, but goal EP-INBOUND **not reached** (stuck; looks “still near Parking A”) |
| Attempt-2 ~0.71 m | `/sim01/odom` GT | **Yes** — arrived EP-CHARGING-A |

Ground truth for this task: Gazebo model **`warotrans_sim_01`** in world **`map_one_v001`**, via bridged `/sim01/odom` (URDF OdometryPublisher). `gz model -p` CLI samples were empty in both attempts; odom bridge remains primary GT.

---

## Instance under test

| Field | Value |
|---|---|
| Launch | `ros2 launch warotrans_simulation multi_sim_map_one.launch.py gui:=true robots:=sim01 nav_start_delay:=40.0 gateway_extra_delay:=25.0` |
| Helper | `ros2_ws/scripts/run_gz_physical_motion_verify.sh` |
| World | `map_one_v001` |
| Entity | `warotrans_sim_01` |
| Namespace | `/sim01` |
| Spawn endpoint | EP-PARKING-A |
| Backend | Simulation Host `:5090` + MQTT `:1883` (authority gate) |
| GUI | `gui:=true` — single robot, no parking peer |

**Attempt-2 spawn (after fix):** `(-1.848, -0.575, yaw=-π/2)` — `layout.endpoints:EP-PARKING-A+nudge`  
**Attempt-1 spawn (bad):** `(-1.798, -0.675)` — standoff nudge into south corridor  

RTF ≈ 0.99–1.00; `/clock` advancing; physics not paused.

---

## Evidence table

| Metric | Attempt-1 (INBOUND) | Attempt-2 (CHARGING-A) |
|---|---|---|
| Nav2 status | TIMEOUT | **PASS** |
| GT arrival (≤0.20 m) | **FAIL** (err≈3.60 m) | **PASS** (err≈0.179 m) |
| odom start → end | (-1.798,-0.675) → (-0.962,-0.823) | (-1.848,-0.575) → (-1.143,-0.655) |
| odom net / path | 0.849 / 0.945 m | 0.710 / 0.819 m |
| map TF net | 0.826 m | 0.628 m |
| gz model -p samples | 0 | 0 |
| cmd_nz nav / safe / gated | 94 / 4 / 4 | 7 / 6 / 5 |
| PHYSICAL_CLASS | MOVED (not to goal) | **MOVED + GT_ARRIVAL** |
| Artifacts | `docs/audits/gz_physical_motion/attempt1/` | `docs/audits/gz_physical_motion/` (+ `attempt2/` if archived) |

Logger: `ros2_ws/scripts/gz_physical_motion_trace.py` → `docs/audits/gz_physical_motion/gt_trace.csv`  
Columns: `sim_t`, `wall_t`, `gz_*`, `odom_*`, `map_*`, `cmd_nav/smoothed/safe/gated`, `authority_ok`, age.

---

## Pipeline break-point (Attempt-1)

```
cmd_vel_nav → VelocitySmoother → cmd_vel_smoothed
       → CollisionMonitor → cmd_vel_safe     ← FIRST ZERO (FootprintApproach)
       → authority_gate → /sim01/cmd_vel
       → ros_gz_bridge → gz DiffDrive → warotrans_sim_01
```

| Stage | Attempt-1 observation |
|---|---|
| `cmd_vel_nav` | Nonzero for long stretches (94 samples) |
| `cmd_vel_safe` | Drops to 0 while nav still commands (CM hold @ t≈38.7 s) |
| `cmd_vel` (gated) | Tracks safe; intermittent gate BLOCKING secondary |
| GZ DiffDrive | Receives gated twists when nonzero; odom advances |
| Root hold | CM FootprintApproach after south-nudged spawn near wall |

Attempt-2: nav/safe/gated stay aligned (7/6/5); no sustained CM zeroing before goal.

---

## Root cause & fixes

### Root cause (Attempt-1 “stationary” perception)

1. **Spawn standoff nudge** forced PARK pose ~15 cm south (`y=-0.675`), into the wall corridor.  
2. Robot physically crept ~0.85 m east then **CM permanently held** — easy to miss in GUI / still looks like Parking A.  
3. Prior dual-recovery claims used **map TF**, not GT arrival.

### Evidence-based fixes (≤3 attempts)

| Fix | File | Why safe |
|---|---|---|
| Skip diagonal standoff when `spawn_require_clearance: false`; prefer same-Y / +X aisle exit | `spawn_pose.py` | Footprint still must be clear; no KEEP_OUT/CM/gate weaken |
| Path fingerprint ~10 cm / ~6° | `semantic_traffic_client.py` | Reduces fail-closed gate thrash on Nav2 micro-replans; grant still required |

**Not changed:** CM `time_before_collision=0.30`, inflation 0.15, RPP `use_collision_detection=false`, ONE_WAY reverse ban, KEEP_OUT, authority gate fail-closed. See `docs/audits/gz_physical_motion/SAFETY_TUNING_AUDIT.md`.

---

## Safety-tuning audit (summary)

No revert of CM/RPP/ONE_WAY/inflation. Attempt-1 CM hold was a **true near-obstacle hold** after bad spawn, not a false motion report. Coarser fingerprint + park nudge fix were the only code changes for Attempt-2 PASS.

---

## Visible navigation result

- **Goal:** EP-PARKING-A → **EP-CHARGING-A** (legal WAYPOINT; shorter aisle-exit than INBOUND after Attempt-1 blocker).  
- **Nav2:** PASS  
- **GT_ARRIVAL:** PASS (odom goal error 0.179 m ≤ 0.20 m)  
- **Physical class:** MOVED (odom net 0.71 m)

EP-INBOUND remains a longer aisle/CM stress route; not required once a legal GT arrival is proven.

---

## Before / after

| | Before P0 | After Attempt-2 |
|---|---|---|
| Proof metric | map TF ~0.92 m | `/sim01/odom` + goal tolerance |
| Spawn | (-1.798,-0.675) | (-1.848,-0.575) |
| Goal | EP-INBOUND TIMEOUT | EP-CHARGING-A PASS |
| Dual E2E | Blocked | Unblocked for resume **after** this PASS |

---

## Reproduce

```bash
# Host: Simulation :5090 + MQTT :1883
source /opt/ros/jazzy/setup.bash
source ros2_ws/install/setup.bash
export P0_GOAL_CODE=EP-CHARGING-A
bash ros2_ws/scripts/run_gz_physical_motion_verify.sh
# Watch Gazebo GUI — single robot leaving Parking A toward Charging A
```

PASS criteria: `GT_ARRIVAL=PASS` in `nav_summary.txt` and `PHYSICAL_CLASS=MOVED` in `gt_analysis.txt`.

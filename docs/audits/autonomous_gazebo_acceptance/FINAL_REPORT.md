# Autonomous Gazebo acceptance — FINAL_REPORT (Stage-3 dual motion recovery checkpoint)

**Date:** 2026-11-01  
**Map:** MAP-ONE-V001 · fingerprint `6dd72df1…`  
**Runtime:** ROS 2 Jazzy · Gazebo **GUI** · Semantic Traffic · LaneAwareNavfn · **no** stage1_open_grant

## Verdict

| Gate | Result |
|---|---|
| Dual/single bringup + semantic gateways | **PASS** |
| MQTT traffic_plan → EXTEND grant path | **PASS** (SIM-01) |
| authority_ok liveness vs cmd_vel gate | **PASS** (20 Hz while grant valid) |
| OFFLINE recovery via heartbeat (not traffic_plan) | **PASS** (unit + live ONLINE→grant) |
| Test A SIM-01 EP-PARKING-A → EP-INBOUND complete | **FAIL** TIMEOUT (~0.92 m) |
| Test B–F dual contention / fairness | **NOT_RUN** (blocked by A) |
| Stage-3 dual DoD | **FAIL** — do not claim PASS from bringup/grants alone |

## What was fixed (verified)

1. **Gate starvation:** semantic `authority_ok` now republished ≥20 Hz while grant valid; path-fingerprint debounce cuts replan thrash.
2. **Reservation leak (code+unit):** semantic diff-release on replan; `ReportVerifiedExit` without RouteGraph; PromoteWaiters retries semantic waiters; entered-then-exited clearance only.
3. **Quarantine policy:** `traffic_plan` never clears OFFLINE/LOCALIZATION_LOSS; `MarkOnline` on verified heartbeat clears OFFLINE only.
4. **Peer obstacle:** Test A/B use `robots:=sim01|sim02` so the other parking bay is empty.

## Remaining demonstrated blocker

After grants and open gate, Nav2 still stalls ~0.9–1 m from Parking A toward INBOUND within 180 s (controller/`cmd_vel` drops while `authority_ok` stays True). Not solved by further grant forcing. B–F deferred until A completes.

## Artifacts

- `DUAL_MOTION_RESULTS.csv`
- `DUAL_ROBOT_RESULTS.md`
- `FIX_LOG.md`
- `runtime/sync_motion_trace_a.csv`
- `backend_sim_recovery3.log`
- `runtime/dual_recovery_orch_console5.log`

## Safety unchanged

KEEP_OUT, ONE_WAY, footprint, authority gate, Collision Monitor remain ON. RouteGraph not hard-retired. Production DB map entities not written for this recovery (Simulation Host + MQTT only).

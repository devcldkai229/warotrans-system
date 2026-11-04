# Autonomous Gazebo acceptance — STATUS

**Updated:** 2026-11-01  
**Map fingerprint:** `6dd72df135c22c33bcc620575d0d222b686953910b953b8f216d992431f27ff0`  
**Endpoints:** 17 · Lanes: 7 · Bundle: `map_one_v001`

## Current stage

Phase F — Dual motion recovery: traffic grant/gate/OFFLINE path **fixed & evidenced**; Test A goal completion still **FAIL** (~0.92 m). B–F **NOT_RUN**. See `DUAL_ROBOT_RESULTS.md` / `FINAL_REPORT.md`.

## Completed

- Planning matrix **272/272**
- Policy probes ONE_WAY / KEEP_OUT / NO_STOP **PASS**
- SPEED velocity capture **PASS**
- Dual/single semantic bringup + `authority_ok` 20 Hz + HB `MarkOnline`
- Semantic reservation diff-release / exit-without-graph (unit tests PASS)

## Blockers

- Test A (ParkingA→INBOUND under Semantic grants): Nav2 stalls ~0.9 m with gate open — not grant denial.
- B–F dual scenarios gated until A PASS.

# Safety-tuning audit (P0 physical motion)

Evidence-only review of sim Nav2 / semantic overlays. No KEEP_OUT / footprint / authority-gate /
ONE_WAY reverse-ban weakening.

| Knob | Current (sim) | Provenance | Verdict for P0 |
|---|---|---|---|
| RPP `use_collision_detection` | `false` | FIX_LOG 2026-11-01 — false-positive carrot aborts after ~1 m | Keep. CM remains the hard stop. |
| CM `FootprintApproach.time_before_collision` | `0.30` s (~0.07 m @ 0.24 m/s) | FIX_LOG — 1.2 s / 0.45 s caused permanent aisle holds | Keep. GT trace shows CM is first zeroing stage; further reduction is not justified without proving false-positive hold. |
| Inflation radius | `0.15` m | Sim aisle clearance vs 0.35 base | Keep. |
| `allow_reversing` | `true` (sim FollowPath) | C-aisle pocket pull-out | Keep. |
| Progress allowance | `35` s | Avoid abort while legally held by CM | Keep. |
| ONE_WAY | reverse-dominant ban only (`along<0 && \|lat\|<\|along\|`) | FIX_LOG — allow lateral crossing | Keep. |
| Lethal traversal | 254 | LaneAware soft cost | Keep. |
| Authority gate | fail-closed, max_age 0.3 s | Stage-3 Semantic | Keep. Path fingerprint coarsened to ~10 cm to stop replan thrash (not a safety weaken). |

## Attempt-1 GT (ParkingA→INBOUND)

- First pipeline zero: `cmd_vel_smoothed` → `cmd_vel_safe` (Collision Monitor), while `authority_ok=True`.
- Gate intermittently BLOCKING later (plan-revision thrash) — secondary.
- Spawn was standoff-nudged to `(-1.798,-0.675)` (south of aisle) → near-wall CM hold after ~0.85 m GT travel.

## Evidence-based fix applied (not safety weaken)

- `spawn_pose.nudge_spawn_to_clear(require_standoff=False)` when layout `spawn_require_clearance: false` → spawn `(-1.848,-0.575)` stays on parking row.
- Semantic `_path_fingerprint` quantize 10 cm / ~6° to reduce gate flap on Nav2 micro-replans.

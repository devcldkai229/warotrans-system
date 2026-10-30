# Traffic hardening — current state (2026-10-28 closeout)

**Status: `PARTIALLY VERIFIED`**

Not `SIMULATION ACCEPTED`: 3× independently reset inbound E2E did not complete 17/17; two-robot Gazebo NOT_RUN.  
Not `BLOCKED` for backend gates: P0/N4/V019 validation Errors are closed with tests and live Host evidence.

---

## SHAs / branch

| Repo | Branch | HEAD (committed) | Working tree |
|------|--------|------------------|--------------|
| `warotrans-system` | `feature/traffic-hardening` | `b8b874b` / prior `fd62d55` Phase A | **Uncommitted** closeout: N4 holds, SweptConflict symmetrize, stopline/exit compiler, `TryGetForMap` GRAPH_IN_USE fix, V019 snapshot + docs |
| `warotrans` | `feature/traffic-hardening` | `dfc70a2` | **Uncommitted**: Nav2 merge order, sim RPP v/L + goal tol, sim reset helpers |

**No push.** Pi/AWS not deployed. Postgres volume **not** destroyed.

---

## P0 — Secrets / environment

| Item | Result |
|------|--------|
| gitleaks `warotrans` | clean → `warotrans/docs/simulation/traffic-hardening/gitleaks-warotrans.json` |
| gitleaks `warotrans-system` | 1 FP (integration JWT test key) → `docs/traffic-hardening/gitleaks-warotrans-system.md` / `.json` |
| Pi SSH helpers in unpublished history | **not present** — no rewrite |
| Pi password / AWS key rotation | **holder-only** (not performed by agent) |
| Postgres | `warotrans-postgres-5434` → volume `infrastructure_postgres_data` |
| Host | `Traffic__Mode=Active`, `MapAssetStorage__Provider=Local`, MQTT `127.0.0.1:1883` |
| Evidence | `docs/traffic-hardening/P0_SECURITY_ENV.md` |

### Reproducible start

```powershell
$env:WAROTRANS_PG_CONTAINER = "warotrans-postgres-5434"
$env:ConnectionStrings__PostgreSQL = "Host=127.0.0.1;Port=5434;Database=warotrans;Username=warotrans;Password=warotrans"
$env:MapAssetStorage__Provider = "Local"
$env:Traffic__Mode = "Active"
# start Host (Development) on :5090
```

```bash
# WSL — kill leftover parameter_bridge first (duplicate /clock → TF jump-back)
bash ros2_ws/scripts/_kill_all_sim.sh
GUI=false bash ros2_ws/scripts/launch_sim_active.sh
# Host must start AFTER robot is LOCALIZED, or operator-reconcile quarantine
```

---

## P1 — N4 station holds

| | |
|--|--|
| Policy | Release previous `ServiceHoldIds` only after prior step done + `IsPhysicallyClear` + not in new destination set + not quarantined for that occupancy. Keep T11 (no auto-release on safe-stop). |
| API | `TrafficState.ReleaseStaleServiceHolds` / coordinator; called from `JobExecutionEngine` on MOVE start + job complete |
| Tests | 7 N4 cases in `TrafficSafetyRegressionTests` (+ T11 preserved) |
| Live E2E N4 proof | **Incomplete** — full 17/17 with hold release at S03 not re-captured this session |

---

## P1 — V019 validation (20 Errors → 0)

MapVersion `d676f366-6f08-417d-921f-ac89e0b18626` **MAP-WHSIM-V019** kept published.

| Code | Start | After fix | Cause |
|------|------:|----------:|-------|
| `OVERLAP_ASYMMETRIC` | 13 | 0 | `SweptConflictIndex` undirected symmetrize |
| `CORRIDOR_NO_STOPLINE` | 4 | 0 | Bidirectional entry/stopline heuristics |
| `CRITICAL_NO_EXIT` | 3 | 0 | Undirected multi-hop `BuildExitSafeStops` |
| Warnings | 8 | 8 | LEGACY_JUNCTION_ZONE / AMBIGUOUS_INTERSECTION (non-blocking) |

Live: `isValid=true`, runtime `graphHash` (no occupancy) `e6009540…`, validation hash (with occupancy) `6a9bf530…`.  
Snapshot: `samples/maps/MAP-WHSIM-V019/`. Analysis: `docs/traffic-hardening/V019_VALIDATION_ANALYSIS.md`.  
**Validator severity not weakened.** No V020 required.

### GRAPH_IN_USE side-fix

`JobExecutionEngine.TryResolveTrafficGraphAsync` no longer uses `TryGetForMap` (validation occupancy compile poisoned Active bind → `traffic_graph_in_use`).

---

## P2 — Nav Phase B (measure → one cause)

| Step | Change | Evidence |
|------|--------|----------|
| Merge order | `nav2_params → outdoor → route → **sim last**` | Live `controller_server` argv |
| v/L | `desired_linear_vel=0.24`, `lookahead=0.20` → **1.20 s⁻¹** | `nav2_params_sim.yaml`; L=0.30+v=0.35 cut corners → JOB-000007 collision-ahead |
| Goal tol | **0.10 m** xy (0.05 not feasible) | JOB-000008 residual ~9 cm of EP-INBOUND then progress-abort |
| Smoother | angular accel 1.2, `scale_velocities: true` | sim overlay |
| Durable logs | `docs/simulation/traffic-hardening/phase_b_params.txt`, `logs/sim_active.log` | TF jump-back fixed by killing duplicate `parameter_bridge` |

Tracking criteria (justified): aisle grid ~5 cm, AMCL noise, measured approach residual ~9 cm → **station xy_goal_tolerance 0.10 m**, not 0.05 m.

Baseline prior E2E tracking: RMS 5.1 cm / peak 14.6 cm (JOB-000003). New full-run RMS not re-measured (no 17/17 this session).

---

## P3 — Three reset inbound E2E

| Run | Job | Result | Notes |
|-----|-----|--------|-------|
| Prior baseline | JOB-20261028-000003 | **17/17 PASS** (107 s) | Before this closeout’s Nav overlays |
| Attempt (dirty bridges) | JOB-000004…006 | FAIL | GRAPH_IN_USE / CONTROLLER / quarantine |
| Attempt (L↑) | JOB-000007 | FAIL @ inbound | collision-ahead |
| Attempt (v↓, tol 0.05) | JOB-000008 | FAIL @ inbound | ~9 cm residual |
| Best this session | **JOB-20261028-000009** | **12/17 FAIL** @ MOVE S02 | IN dock + 3× pickup + S01 putaway OK; S02 CONTROLLER_FAILED |

Evidence: `warotrans/docs/simulation/traffic-hardening/e2e-run-1/` (`console.log`, `job.json`, `traffic-*.json`).  
**Gate: FAIL** — need ≥3 full 17/17 with durable evidence after Host+sim independent resets.

---

## P4 — Two-robot

**NOT_RUN** (P3 gate not passed). Overlay `robot_gateway_sim_02_active_overlay.yaml` exists; namespaced dual Nav2 still absent (M05).

---

## Remaining blockers

1. Complete 3× reset inbound E2E 17/17 with N4 hold acquire/release proof at each station.  
2. S02 path still hits RPP “collision ahead” / progress abort under current sim params — further Phase B (one cause) or corridor inflation.  
3. Operational: always `_kill_all_sim.sh` before relaunch; start Host after LOCALIZED.  
4. Two-robot infra + 12-scenario matrix.  
5. Commit/push unpublished closeout when authorized.

---

## Source diffs that landed (uncommitted)

**warotrans-system**

- `TrafficState.ReleaseStaleServiceHolds` + engine hooks + N4 tests  
- `SweptConflictIndex` symmetrize + tests  
- `TrafficGraphCompiler` stopline/exit fixes + tests  
- `JobExecutionEngine` remove `TryGetForMap` shortcut  
- `samples/maps/MAP-WHSIM-V019/`, validation dumps, this report  

**warotrans**

- `navigation.launch.py` merge order  
- `nav2_params_sim.yaml` v/L + goal tol + smoother  
- sim kill/reset helper scripts under `ros2_ws/scripts/`  

---

## Unit tests (this session)

- `TrafficGraphSafetyRegressionTests`: 12 PASS (incl. stopline/exit)  
- N4 / T11 fleet traffic safety regressions: PASS (prior + this branch)

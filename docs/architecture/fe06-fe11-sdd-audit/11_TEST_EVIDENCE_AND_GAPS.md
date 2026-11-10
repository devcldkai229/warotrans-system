# 11 — Test Evidence and Gaps

**Policy:** Code ≠ unit test ≠ Gazebo PASS. Dual-robot PASS is **not** claimed.

---

## FE-06 scenarios

| Scenario | Implementation | Tests | Live evidence | Gaps |
|---|---|---|---|---|
| SQ01 NavigateToPose | IMPLEMENTED | fleet Python tests; backend MQTT contracts | Single-robot nav audits exist; mixed readiness | Ultrasonic OA missing |
| SQ02 Obstacle/replan | EXTERNAL Nav2 + BT config | Nav2/sim probes in scripts/docs | Not asserted as custom OA PASS | No custom OA unit algorithm |
| SQ03 Cancel/fail | IMPLEMENTED | handler paths | — | Legacy mid-run loc loss PARTIAL |
| Global path / ONE_WAY | LaneAware IMPLEMENTED | lane planner / path_policy / adapter tests | Sim-heavy | Default robot params use Navfn |
| Final XY/yaw | Nav2 goal tolerances CONFIG | acceptance docs mixed | Direct-nav audits show FAIL cases historically | Do not mark all endpoints PASS |

---

## FE-11 scenarios

| Scenario | Implementation | Unit tests | Gazebo dual | Notes |
|---|---|---|---|---|
| SQ01 authorize+move | IMPLEMENTED | SemanticAuthorityRenew, reservation tests | grants often PASS; goals FAIL | Document code path |
| SQ02 two-robot contention | IMPLEMENTED | TrafficSafetyRegression, Segmented tests | DUAL_ROBOT_RESULTS FAIL/NOT_RUN | **No dual PASS claim** |
| SQ03 replan | IMPLEMENTED | semantic reservation / revoke-keep occupancy | partial | |
| SQ04 offline/loc loss | IMPLEMENTED | quarantine offline tests | — | V1 auto-release differs |
| SQ05 cancel/fail | IMPLEMENTED APIs | safety regression | NOT_RUN matrix | |
| Deadlock reject | IMPLEMENTED WouldCreateWaitForCycle | T* regression | — | No recovery planner |
| Fairness aging | IMPLEMENTED EffectivePriority | coordinator tests | dual fairness unproven | |

### Key test locations

**Backend:** `backend/tests/WaroTrans.UnitTests/Fleet/Traffic/`  
(`TrafficSafetyRegressionTests`, `SegmentedTrafficCoordinatorTests`, `SemanticReservationTests`, `SemanticAuthorityRenewTests`, …)

**Robot:** `ros2_ws/src/warotrans_fleet/test/`  
(`test_semantic_traffic_client.py`, `test_traffic_client.py`, `test_authority_store.py`, `test_cmd_vel_authority_gate.py`, `test_path_policy_validator.py`)

### Acceptance docs (honest)

- `docs/audits/autonomous_gazebo_acceptance/DUAL_ROBOT_RESULTS.md` — dual Stage-3 goals FAIL/NOT_RUN  
- `docs/audits/autonomous_gazebo_acceptance/FINAL_REPORT.md` — dual DoD FAIL  
- `warotrans/docs/simulation/STAGE3_FLEET_TRAFFIC_ACCEPTANCE.md` — unit PASS; Gazebo matrix NOT_RUN  

---

## What SDD diagrams MAY claim

- Accurate class structure and sequence **as implemented in source**.  
- Mode differences Shadow/Active/Semantic.  
- Unit-tested conflict/wait/promote/quarantine behavior.

## What SDD diagrams MUST NOT claim

- Dual-robot warehouse conflict resolution proven in Gazebo PASS.  
- Complete dynamic obstacle avoidance via custom WaroTrans algorithm.  
- Ultrasonic-based Nav2 OA.  
- Full deadlock recovery planner.  
- RouteGraph fully retired.

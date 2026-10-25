# Traffic Management — Implementation status

**Date:** 2026-10-25  
**Branches:** `warotrans-system/feature/traffic-coordinator`, `warotrans/feature/traffic-coordinator`  
**Physical robot motion:** not executed (by design)  
**Coordinator mode:** Shadow default (`Traffic:Mode=Shadow`); Active opt-in  
**Robot mode:** legacy default (`traffic_mode:=legacy`); Active opt-in  
**Git tag:** `pre-traffic-active` (both repos)  
**Branch:** `feature/traffic-operations`

## Acceptance matrix (Active integration)

| Acceptance | Result | Evidence |
|------------|--------|----------|
| Deterministic graph compilation | **PASS** | `TrafficGraphCompilerTests` |
| Junction groups do not cross-include edges | **PASS** | `Two_junction_zones_do_not_cross_include_edges` |
| Swept overlaps → PhysicalOverlap resources | **PASS** | `Physical_overlap_resources_exist_when_edges_conflict` |
| Safe-stop indexes + exit validation | **PASS** | Compiler + `TrafficGraphValidator` rules |
| Single-writer Channel actor | **PASS** | `SegmentedTrafficCoordinator` |
| Verified-exit only / quarantine on offline | **PASS** | `Release_without_verified_exit_rejected`, `Offline_uncertain_location_quarantines` |
| No conflicting grants under stress | **PASS** | `Parallel_stress_no_conflicting_grants` |
| Deadlock-risk / fairness / cancel / restart | **PASS** | Segmented scenario tests |
| Shadow observes, no motion from actor | **PASS** | `TrafficShadowObserver` + V1 still dispatches |
| Shadow single-mover guard | **PASS** | `ShadowSingleMoverGuard` in `StartMoveAsync` |
| Event-driven V1 grant pump (no 200 ms poll) | **PASS** | `TrafficReadySignal` + `TrafficGrantHostedService` |
| Full backend unit suite | **PASS** | 402 passed, 0 failed |
| Benchmark numbers recorded | **PASS** | See below |
| MQTT authority + EXTEND/RENEW/REVOKE contract | **PASS** | `mqtt-robot-contracts.md`, DTOs, topics |
| TrafficAuthorityPublisher + ProgressIngress | **PASS** | Fleet Traffic + unit smoke |
| Active MOVE branch (JobExecutionEngine) | **PASS** | Skips V1 when `Mode=Active` |
| Robot TrafficClient / AuthorityStore / Supervisor | **PASS** | pytest warotrans_fleet |
| cmd_vel_authority_gate (default off) | **PASS** | unit + launch flag |
| Gazebo six scenarios | **NOT_RUN** | [SIM-RESULTS.md](SIM-RESULTS.md) |
| Pi / physical E2E | **NOT_RUN** | SSH blocked; [PHYSICAL-RESULTS.md](PHYSICAL-RESULTS.md) |
| Operator motion tests | **BLOCKED** | Need explicit approval |
| Station policies (Inbound/Outbound/Shelf/…) | **PASS** | `StationPolicyResolver` + Active MOVE/HUMAN hold |
| Job cancel + HUMAN timeout keep-hold | **PASS** | `CancelJob` API + `HumanConfirmTimeoutHostedService` |
| Traffic ops structured log | **PASS** | `ITrafficOpsLog` + `/traffic/ops-log` |
| Fleet map traffic overlay | **PASS** | `FleetMap` polls snapshot |
| ADR 0011 Traffic Operations | **PASS** | `docs/adr/0011-traffic-operations.md` |

## Benchmark (local, 2026-10-25)

```text
grid=32x32 robots=10 route_p50=4.843ms route_p95=18.744ms route_p99=18.744ms acq_p50=0.038ms acq_p95=6.437ms acq_p99=6.437ms throughput=144.7/s alloc=8868872B ws=101888000
grid=32x32 robots=25 route_p50=3.417ms route_p95=5.147ms route_p99=6.845ms acq_p50=0.035ms acq_p95=0.047ms acq_p99=0.049ms throughput=292.2/s alloc=16139088B ws=103538688
grid=32x32 robots=50 route_p50=3.409ms route_p95=6.755ms route_p99=9.136ms acq_p50=0.036ms acq_p95=0.103ms acq_p99=1.281ms throughput=286.9/s alloc=30834040B ws=107380736
grid=64x64 robots=10 route_p50=7.680ms route_p95=14.068ms route_p99=14.068ms acq_p50=0.030ms acq_p95=0.065ms acq_p99=0.065ms throughput=119.3/s alloc=33193688B ws=137801728
grid=64x64 robots=25 route_p50=7.108ms route_p95=14.638ms route_p99=15.020ms acq_p50=0.031ms acq_p95=0.043ms acq_p99=0.052ms throughput=128.2/s alloc=70569520B ws=146362368
grid=64x64 robots=50 route_p50=5.671ms route_p95=8.077ms route_p99=16.154ms acq_p50=0.020ms acq_p95=0.031ms acq_p99=0.041ms throughput=180.5/s alloc=114036152B ws=132038656
```

Command: `dotnet test ... --filter FullyQualifiedName~SegmentedTrafficBenchmark`

## Test commands / results

```text
dotnet test backend/tests/WaroTrans.UnitTests/WaroTrans.UnitTests.csproj
→ Passed: 402, Failed: 0

dotnet test ... --filter FullyQualifiedName~SegmentedTraffic
→ scenario + property + stress + overload PASS
```

## Deliverables

| Deliverable | Path |
|-------------|------|
| ADR traffic operations | [../adr/0011-traffic-operations.md](../adr/0011-traffic-operations.md) |
| ADR robot traffic client | [../adr/0010-robot-traffic-client.md](../adr/0010-robot-traffic-client.md) |
| Robot integration + rollback | [ROBOT-INTEGRATION.md](ROBOT-INTEGRATION.md) |
| Runtime audit | [ROBOT-RUNTIME-AUDIT.md](ROBOT-RUNTIME-AUDIT.md) |
| ADR segmented authority | [../adr/0009-segmented-traffic-authority.md](../adr/0009-segmented-traffic-authority.md) |
| Segmented actor + state | `backend/src/Modules/Fleet/Traffic/SegmentedTrafficCoordinator.cs`, `TrafficState.cs` |
| Route planner | `RoutePlanner.cs` |
| Shadow observer / guard | `TrafficShadowObserver.cs`, `ShadowSingleMoverGuard.cs` |
| Ops API | `GET /api/fleet/traffic/snapshot`, `/diagnostics`, reconcile / release-after-clearance |
| Graph fixes | `TrafficGraphCompiler` resource kinds + indexes |
| Fake robot tests | `backend/tests/.../Fleet/Traffic/SegmentedTrafficCoordinatorTests.cs` |

## Risks

1. Shadow vs V1 comparison may diverge on segment boundaries (V1 grants whole route).
2. Exit clearance uses turn-radius distance to resource edges; needs real-map validation.
3. Active Mode still requires robot Traffic Client + MQTT authority fields.
4. V1 still auto-releases on offline (active dispatcher); segmented path quarantines instead.
5. Real maps (MAP-WHSIM / map3) still BLOCKED for empty Edges / missing PGM.

## Known blockers (unchanged from graph phase)

1. MAP-WHSIM-V002: no Edges in local DB.
2. warotrans_map3.pgm missing locally.
3. WSL/Pi `nav2_route` not verified in this session.
4. Service-stop ↔ StorageLocation wiring incomplete.

# Traffic Management — Implementation status

**Date:** 2026-10-24  
**Branches:** `warotrans-system/feature/traffic-graph`, `warotrans/feature/traffic-route-grant`  
**Physical robot motion:** not executed (by design)

## Acceptance matrix

| Acceptance | Result | Evidence |
|------------|--------|----------|
| Deterministic graph compilation | **PASS** | `TrafficGraphCompilerTests` + benchmark (same hash twice) |
| Directed routes respect geometry + zone rules | **PASS** (synthetic) | Unit tests; KEEP_OUT cut / JUNCTION / ONE_WAY |
| Invalid map elements detected | **PASS** (synthetic) | Validator issue codes; real maps BLOCKED until lanes/PGM |
| Required stations routable or BLOCKED with reason | **PASS** (API) | `GET .../traffic-graph/validation`; sim/map3 reports BLOCKED reasons |
| Graph immutable during traffic execution | **PASS** | ImmutableArray / FrozenDictionary; cache keyed by GraphHash |
| Relevant unit tests pass | **PASS** | See commands below |
| Existing Navigation/Workflow tests remain passing | **PASS** | 165 filtered unit tests (Navigation+Traffic+JobExecution+Fleet.Traffic) |
| Nav2 cannot drive ungranted edge | **NOT_RUN** | WSL `nav2_route` **NOT_INSTALLED**; gateway unit mocks DynamicEdges/ComputeRoute **PASS** |
| Pi nav2_route + physical route E2E | **NOT_RUN** | No deploy / no motion |

## Test commands / results

```text
# Backend
dotnet test backend/tests/WaroTrans.UnitTests/WaroTrans.UnitTests.csproj `
  --filter "FullyQualifiedName~Navigation|FullyQualifiedName~Traffic|FullyQualifiedName~JobExecution|FullyQualifiedName~Fleet.Traffic"
→ Passed: 165, Failed: 0

dotnet test ... --filter "FullyQualifiedName~TrafficGraphBenchmark"
→ PASS (Benchmark trait)

# Robot gateway
cd ros2_ws/src/warotrans_fleet
$env:PYTHONPATH=(Get-Location).Path
python -m pytest test/test_route_grant.py test/test_move_command.py -q
→ 44 passed

# WSL Route Server integration
ros2 pkg prefix nav2_route
→ NOT_INSTALLED  ⇒ launch_testing NOT_RUN
```

## Deliverables

| Deliverable | Path |
|-------------|------|
| Architecture audit | [ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md) |
| ADR route ownership | [../adr/0007-traffic-route-ownership.md](../adr/0007-traffic-route-ownership.md) |
| ADR grant V1 | [../adr/0008-traffic-grant-v1.md](../adr/0008-traffic-grant-v1.md) |
| CompiledTrafficGraph | `backend/src/Modules/Navigation/Traffic/*` |
| Validation + debug SVG | `GET .../traffic-graph/validation`, `.../debug.svg` |
| Real map report | [REAL-MAP-VALIDATION.md](REAL-MAP-VALIDATION.md) |
| TrafficCoordinator | `backend/src/Modules/Fleet/Traffic/*` |
| Gateway enforcement | `warotrans_fleet/route_grant.py`, `route_enforcer.py`, `nav2_route_client.py` |
| MQTT contract `route` | `docs/mqtt-robot-contracts.md` |
| Rules update | `rules/05-NAVIGATION-RULES.md` |

## Known blockers

1. **MAP-WHSIM-V002:** no Edges in local DB → empty graph until Map Editor lanes exist.
2. **warotrans_map3.pgm** missing locally → occupancy clearance cannot run.
3. **WSL/Pi `nav2_route`:** not verified in this session → DynamicEdges live integration NOT_RUN.
4. **Service-stop ↔ StorageLocation** wiring optional/incomplete (PARK used for recovery).
5. Container overhang clearance out of scope (user: empty robot only).

## Changed areas (summary)

**Backend:** Navigation Traffic/*, GetRouteGraph(+hash), GetTrafficGraphValidation/DebugSvg, Fleet TrafficCoordinator + grant pump, Navigate payload route, JobExecutionEngine MOVE grant, mqtt contract, rules/05, ADRs.

**Robot:** route enforcement modules + gateway/move wiring + pytest.

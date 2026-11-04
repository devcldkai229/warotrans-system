# RouteGraph final hardening audit

Date: 2026-10-31  
Constraint: **database read-only** (no INSERT/UPDATE/migration/seed/clone/publish; no PGM mutation in DB assets).

## Root causes (verified)

1. **Straight-only lane access** — `AttachLaneAccess` invented a perpendicular foot↔station chord. Walls between shelf/parking poses and the centre line caused occupancy strip → `SERVICE_ACCESS_BLOCKED`, then cascade `ENDPOINT_DISCONNECTED` / `ONE_WAY_TRAP` / `ENDPOINT_UNREACHABLE`.
2. **Cascade noise** — validator emitted pairwise disconnect / trap for every SAB orphan station.
3. **SAFE_STOP_IN_CRITICAL on stations** — bay stations adjacent to junction/critical connectors were treated as corridor safe-stop candidates.
4. **Debug SVG** — highlighted IC/TURN only; no rejected-access ghost or SAB markers.
5. **Diagnostics skew (resolved 2026-10-31)** — `RuntimeIncludesOccupancy=true` + `CompilerVersion=5`; Check / Debug SVG / GetRouteGraph / Active MOVE share one occupancy-aligned hash. Junction transitions are occupancy-safe in-polygon paths (unsafe straight chords stripped). See `ROUTEGRAPH_REAL_MAP_ACCEPTANCE.md`.

## Algorithm before → after

| Step | Before | After |
|---|---|---|
| Off-lane attach | Straight spur or SAB/TOO_FAR | Straight → else **local footprint BFS** → `IsConnector` polyline |
| Occupancy | Strip connectors after build | Plan with clearance at build + strip fail-closed |
| SAB message | Generic | `KEEP_OUT` / `NO_PATH` (+ rejected path list for SVG) |
| Validator | Spam disconnect for SAB EPs | Skip cascade when SAB already present |
| Safe-stop | Station in critical → error | Stations skipped for `SAFE_STOP_IN_CRITICAL` |

No new ZoneType. JUNCTION remains portal connectivity. SINGLE_OCCUPANCY remains occupancy-only. No HalfWidth/TurnRadius reduction.

## Source files changed

- `RouteGraph/EndpointAccessPathFinder.cs` (new)
- `RouteGraph/RouteGraphAccessContext.cs` (new)
- `RouteGraph/RouteGraphBuilder.cs`
- `Traffic/TrafficGraphCompiler.cs`
- `Traffic/TrafficGraphValidator.cs`
- `Traffic/TrafficDebugSvgWriter.cs`
- `Traffic/TrafficModels.cs` (`RejectedAccessPaths` on compile result)
- `Features/GetTrafficGraphDebugSvg/Handler.cs`
- `web/.../MapEditorPage.tsx` (Debug SVG button)
- Tests: `MapSnapshotCompileHarness.cs`, `EndpointAccessPathFinderTests.cs`
- Docs: `docs/navigation/junction-zone.md`, this file

## Validation on snapshot (in-memory, no DB write)

Fixture: `samples/maps/MAP-WHSIM-V019` via `MapSnapshotCompileHarness`.

Command:

```bash
dotnet test backend/tests/WaroTrans.UnitTests/WaroTrans.UnitTests.csproj --filter "FullyQualifiedName~Navigation"
```

Result (this session): **187 passed**, including `Snapshot_MAP_WHSIM_V019_compiles_in_memory_without_db`.

Synthetic coverage: 0.5/1.0/1.5 m free spur; KEEP_OUT SAB; wall/bent-path case; cascade hygiene assert on snapshot.

## Remaining layout-true errors (expected INVALID until map/geometry reviewed)

Do **not** force `isValid=true`. After code hardening, remaining codes on a given MapVersion typically include:

- `INSUFFICIENT_CLEARANCE` / `TURN_CLEARANCE` — real footprint vs occupancy/lane width (do not lower thresholds).
- `CORRIDOR_NO_STOPLINE` — corridor entry heuristic / missing approach topology (review EntryNodeIds / lanes into critical regions).
- `SERVICE_ACCESS_BLOCKED (NO_PATH|KEEP_OUT)` — no footprint-clear corridor within `MaxEndpointAccessDistance` from nearest foot (move EP, clear obstacle, or draw lane closer — **in Map Editor**, not by agent DB edits).
- True `ENDPOINT_UNREACHABLE` / `ONE_WAY_TRAP` on non-SAB stations — ONE_WAY topology gaps between lane components.

Use **Debug SVG** (`GET /api/navigation/maps/{id}/traffic-graph/debug.svg`) for rejected spur ghosts (dashed red) and SAB markers.

## Visualization

- Map Editor: **Debug SVG** button (opens API SVG in new tab).
- Writer: occupancy sample, zones, connectors, rejected access polylines, SAB/IC/TURN highlights.

## Traffic correctness

- Access polylines remain `IsConnector` → `bay:{code}` resources + JunctionConflict for JUNCTION edges unchanged.
- No parallel routing engine; Nav2 still consumes authorized graph only (ADR 0007).
- Multi-robot bay exclusion covered by existing FakeRobotSim regression (`Off_lane_bay_resource_excludes_second_robot`).

## Database mutation confirmation

**None.** Snapshot load is file-based; compile/validate runs in unit-test process memory. No EF write, no SQL mutation scripts executed for this hardening.

## Limitations

- Local BFS is compile-time, bounded by `MaxEndpointAccessDistance` and cell budget; not a global free-space planner.
- `GetRouteGraph` export may still omit occupancy strip vs validation — prefer Check / Debug SVG for safety issues.
- Physical map obstacles that leave no safe bay approach remain INVALID by design.

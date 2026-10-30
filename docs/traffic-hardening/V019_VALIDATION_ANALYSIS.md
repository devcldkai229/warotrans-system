# MAP-WHSIM-V019 validation analysis (2026-10-28)

MapVersionId: `d676f366-6f08-417d-921f-ac89e0b18626`  
Published graphHash (input fingerprint): `6a9bf530f9aab4aacc88a23e00650351019550e0838338805291986205b635d2`  
Snapshot export: `samples/maps/MAP-WHSIM-V019/`

Raw dumps: `v019-validation-raw.json`, `v019-errors.txt`, `v019-errors-after-symmetrize.txt`, `v019-validation-after-stopline-exit-fix.json`.

## Summary — before / after compiler fixes

| Code | Severity | Count start | After SweptConflict symmetrize | After stopline/exit fix | Root cause class | Correction |
|------|----------|-------------|--------------------------------|-------------------------|------------------|------------|
| `OVERLAP_ASYMMETRIC` | ERROR | **13** | **0** | **0** | Compiler index bug | Symmetrize undirected conflicts in `SweptConflictIndex.Build` |
| `CORRIDOR_NO_STOPLINE` | ERROR | **4** | **4** | **0** | Compiler entry heuristic | Bidirectional junction EntryNodeIds + boundary fallback in `TrafficGraphCompiler` |
| `CRITICAL_NO_EXIT` | ERROR | **3** | **3** | **0** | Compiler exit search | Undirected multi-hop BFS in `BuildExitSafeStops` (depth ≤ 12) |
| `LEGACY_JUNCTION_ZONE` | WARNING | 4 | 4 | 4 | Legacy zone metadata | Non-blocking |
| `AMBIGUOUS_INTERSECTION` | WARNING | 4 | 4 | 4 | Geometry ambiguity | Non-blocking |

**Live validation after Host rebuild:** `isValid=true`, **0 Errors**, stoplineCount=49, corridorCount=12.  
Validator severity **not** weakened. **No V020 / map geometry edit required** — occupancy/hash equivalent; V019 kept published for rollback and runtime.

## OVERLAP_ASYMMETRIC (13) — fixed in index

Representative pairs were true near-miss overlaps (d ≤ 2×turnRadius) stored one-way after spatial-hash + ShareVertex skips. Symmetrize keeps mutual exclusion; do not delete overlap resources.

## CORRIDOR_NO_STOPLINE (4) — fixed in compiler

Corridors 5,6,7,11 (junction groups) had empty EntryNodeIds under the directed “StartId with no internal predecessor” rule on BIDIRECTIONAL chords. Entry is now any corridor node with an external non-critical incident edge; stopline placement prefers `EntryNodeIds` then boundary fallback.

## CRITICAL_NO_EXIT (3) — fixed in compiler

`narrow:EDGE-340/341/342` missed exits because exit search only walked `StartId→EndId` one hop. Exit search is now undirected BFS outside the resource until a safe-stop (max depth 12).

## MapVersion policy

- **V019 remains PUBLISHED** (rollback + current sim binding).
- Compiler-only fix → same input `graphHash`; Host restarted so `CompiledTrafficGraphCache` holds the new compile.
- Snapshot checked in under `samples/maps/MAP-WHSIM-V019/`.
- Do not allow publish-with-Error for **new** versions after this baseline.

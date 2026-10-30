# WaroTrans — Complete Map Coordinate Mapping Audit

**Scope:** `MAP-WH42CFE65F-V001` (published). Read-only.  
**Companion artifacts:** `MAP_POSITION_SNAPSHOT.json`, `MAP_ALIGNMENT_FINDINGS.md`  
**Captured:** 2026-10-30 (Asia/Bangkok). No map/DB/frontend/ROS/Gazebo mutations performed.

This document is self-contained for an external architecture reviewer. Paths are relative to:

- `warotrans-system` — Host, Navigation, Fleet, web UI  
- `warotrans` — ROS 2 Jazzy + Gazebo simulation  

---

## 1. Architecture overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Map Editor (pixel space u,v)                                            │
│  preview PNG + MapVersion meta → pixelToWorld / worldToPixel             │
│  Persists Endpoint/Edge/Zone world metres to Navigation DB               │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ world (x,y,yaw) in frameId = "map"
┌───────────────────────────────▼──────────────────────────────────────────┐
│  Navigation DB  MapVersion + Endpoints + Edges + Zones                   │
│  RouteGraphBuilder (compile) → nodes/edges/connectors (in-memory)        │
│  TrafficGraphCompiler → CompiledTrafficGraph + optional occupancy checks │
│  Export GeoJSON for Nav2                                                 │
└───────────────┬───────────────────────────────┬──────────────────────────┘
                │                               │
┌───────────────▼──────────────┐  ┌─────────────▼──────────────────────────┐
│ Fleet Monitor WarehouseMap   │  │ Gazebo + Nav2 (warotrans sim)          │
│ SVG viewBox in metres        │  │ world == map (generate_warehouse.py)   │
│ X=x-minX, Y=maxY-y           │  │ sim_warehouse.yaml origin matches MV   │
│ Robot marker = fleet.robots  │  │ Spawn = EP-PARK-5; AMCL initial_pose    │
│ pose (MQTT telemetry)        │  │ TF map→odom→base_footprint→base_link   │
└──────────────────────────────┘  └────────────────────────────────────────┘
```

**Five poses that must not be conflated**

| # | Pose | Owner | Typical source |
|---|---|---|---|
| 1 | Persisted Endpoint | Navigation DB | Map Editor save |
| 2 | Compiled station / foot | RouteGraphBuilder | Compile-time only |
| 3 | Gazebo ground truth | Gazebo | Model pose in world |
| 4 | ROS localized pose | AMCL / TF `map→base_link` | Localization |
| 5 | Fleet Monitor marker | `fleet.robots.PoseX/Y` | MQTT when `LOCALIZED` |

---

## 2. MapVersion and occupancy identity (verified)

| Field | Value |
|---|---|
| MapVersion ID | `f663f14f-3a28-4d14-aa4b-19d9e11bad69` |
| Code | `MAP-WH42CFE65F-V001` |
| Status | `PUBLISHED` |
| VersionNo | 1 |
| Warehouse | `42cfe65f-7727-4dd2-a66b-b9b93dc2d549` (`WH-42CFE65F`) |
| FrameId | `map` |
| Resolution | `0.05` m/px |
| Origin | `(-2.929, -1.415)`, yaw `0` |
| Image size | `102 × 67` px |
| Occupied / free / negate | `0.65` / `0.196` / `false` |
| Content hash | `b7ee8133e811a81e535d2ffab8ea2594cec5b1e4c7cc6be650338bfc0c7746a3` |

**Asset URIs (Host local map-assets)**

```text
/map-assets/42cfe65f-7727-4dd2-a66b-b9b93dc2d549/f663f14f-3a28-4d14-aa4b-19d9e11bad69/map.pgm
/map-assets/.../map.yaml
/map-assets/.../map-preview.png
```

On-disk Host copy: `backend/src/WaroTrans.Host/data/maps/<wh>/<mv>/` — YAML `image: warotrans_remap_20261027_v2.pgm`, origin `[-2.929, -1.415, 0]`.

**World AABB (yaw = 0)**

```text
minX = originX = -2.929
maxX = originX + W*res = -2.929 + 102*0.05 = 2.171
minY = originY = -1.415
maxY = originY + H*res = -1.415 + 67*0.05 = 1.935
```

**Who uses this map**

| Consumer | Reference | Same as V001? |
|---|---|---|
| Map Editor | MapVersion preview + meta API | YES |
| Fleet Monitor | `useMonitorMapVersion` → same preview URI + `boundsFromMapMeta` | YES |
| RBT-SIM-01 | `fleet.robots.currentMapVersionId` = V001 id | YES |
| Sim layout | `warehouse_layout.yaml` `map_version_id/code` | YES |
| Sim occupancy | `maps/sim_warehouse.yaml` origin/res match | YES |
| Gateway overlay | `MAP-WH42CFE65F-V001` + GeoJSON path | YES |
| Older V018/V019 | Not in Active sim config under audit | N/A for Active |

**Live validation (Host API, occupancy-on)**

- `graphHash` ≈ `888ee3c0…`  
- `isValid: false` (clearance / stopline / junction issues — topology still exportable)  
- ~51 nodes, ~136 directed edges, 17 stations  

**Caution:** `samples/maps/MAP-WH42CFE65F-V001/route-graph.geojson` on disk was **CORRUPTED** (UTF-16 / PowerShell dump). Do not use for coordinate checks. Prefer live export / sim `/home/ser/maps/route_graph_wh42cfe65f_v001.geojson`.

---

## 3. Coordinate conversion formulas (implementation)

### 3.A Pixel → world (Map Editor)

**Source of truth:** `web/src/shared/map/mapCoordinateTransform.ts` lines 1–74.

Image convention:

- `(u,v)` continuous pixels from **top-left** of the occupancy / preview image.  
- `u` → right, `v` → down.  
- ROS map origin is the **lower-left** image corner `(0, H)`.  
- **No** +0.5 cell-center shift for editor clicks (cells use `cellCenterToWorld` separately).

```text
localX = u * resolution
localY = (imageHeightPixels - v) * resolution
worldX = originX + cos(yaw)*localX - sin(yaw)*localY
worldY = originY + sin(yaw)*localX + cos(yaw)*localY
```

Inverse (`worldToPixel`):

```text
dx = x - originX;  dy = y - originY
localX =  cos(yaw)*dx + sin(yaw)*dy
localY = -sin(yaw)*dx + cos(yaw)*dy
u = localX / resolution
v = imageHeightPixels - localY / resolution
```

For V001 `yaw = 0` this collapses to:

```text
x = originX + u * 0.05
y = originY + (67 - v) * 0.05
u = (x - originX) / 0.05
v = 67 - (y - originY) / 0.05
```

**Worked example — Parking A** `(-1.929, -0.965)`:

```text
u = (-1.929 - (-2.929)) / 0.05 = 20.00
v = 67 - (-0.965 - (-1.415)) / 0.05 = 67 - 9.00 = 58.00
```

Editor usage: `MapEditorCanvas.tsx` converts pointer → image → `pixelToWorld` (e.g. lines 211, 356, 434) and places endpoints with `worldToPixel` then `translate(u,v)` (~600–606). Zoom/pan is CSS `translate + scale` on the image stage (~450).

Backend occupancy cell indexing (`OccupancyGrid.cs` ~121): `col = floor((x - OriginX) / Resolution)` — discrete cells for clearance, not editor clicks.

### 3.B World → Fleet Monitor screen

**Component:** `web/src/shared/map/WarehouseMap.tsx`.

1. Bounds from MapVersion via `boundsFromMapMeta` (`mapBounds.ts` lines 5–12): corners `(0,0)`, `(W,0)`, `(0,H)`, `(W,H)` through `pixelToWorld`.  
2. Draw space is **metres**, not pixels:

```text
width  = maxX - minX
height = maxY - minY
X(x)   = x - minX
Y(y)   = maxY - y          // screen Y down
```

(`WarehouseMap.tsx` lines 175–178.)

3. SVG: `viewBox="0 0 {width} {height}"`, `preserveAspectRatio="xMidYMid meet"` (~312–313).  
4. Occupancy image inside: `preserveAspectRatio="none"` so it stretches exactly over the metre AABB (~341).  
5. Endpoints / robots: `translate(X(x), Y(y))` with shared `mark` scale (~622, ~668). Marker glyph is centered on the pose (no large fixed pixel offset).  
6. Zoom/pan: stage CSS transform; follow-mode pan math (~196–203).  
7. Click inverse (`toMetres`, ~211–217):

```text
x = minX + ((clientX - left) / rect.width) * width
y = maxY - ((clientY - top) / rect.height) * height
```

**Same transform for:** zones (polygons), edges (polylines), endpoints, robots, movement lines.  
**Different from Editor:** Editor draws in **image pixels**; Monitor draws in **world metres**. For `originYaw=0` and bounds from the same meta, they are equivalent for object placement.

Device pixel ratio: not specially compensated; SVG uses CSS pixels via `getBoundingClientRect`.

### 3.C Backend RouteGraph / Traffic

**Builder:** `backend/src/Modules/Navigation/RouteGraph/RouteGraphBuilder.cs`  
**Options:** `RouteGraphModels.cs` — `EndpointSnapDistance = 0.5` m, vertex tolerance ~0.05 m.

`AttachEndpoint` (lines 493–550):

1. If Endpoint within tolerance of an existing **drivable node** → attach code to that node.  
2. Else nearest perpendicular **foot** on a lane segment.  
3. If closer to a **junction zone** than to a lane → portal/junction attach.  
4. If distance > 0.5 m and no junction → **Error** `EndpointTooFar` (compile issue).  
5. If on lane (dist ≤ tolerance) → Endpoint code on **foot** node (lane stays straight).  
6. If off lane but ≤ 0.5 m → new node at **Endpoint (x,y)** + bidirectional **connector** to foot.

**Critical:** compile **does not UPDATE** `navigation.endpoints`. Persisted X/Y stay as edited. Only the compiled graph may add a connector or attach to a foot. Nav2 goals still use the Endpoint world pose / station node at that pose.

Traffic resources / safe-stops / GeoJSON derive from the compiled graph + TrafficGraphCompiler (`TrafficGraphCompiler.cs`, `TrafficGraphCompileService.cs`). Occupancy world→cell uses the same origin/resolution as MapVersion.

### 3.D Gazebo and ROS

**Contract (verified in config):** Gazebo **world frame == ROS `map` frame** for this warehouse generator.

Evidence:

- `warotrans/.../scripts/generate_warehouse.py` docstring: occupancy in the same frame (`world == map`).  
- Rejects rotated origin (`yaw != 0`) at generation (~528–529).  
- `maps/sim_warehouse.yaml`: origin `[-2.929, -1.415, 0]`, resolution `0.05`.  
- `warehouse_layout.yaml`: `map_version_id` / `code` = V001; `spawn_endpoint_code: EP-PARK-5`.  
- `sim_endpoints.json`: `frame: "map"`, spawn `(-1.929, -0.965, yaw=-π/2)`.

**TF chain (project contract):**

```text
map → odom → base_footprint → base_link → laser …
```

- `map→odom`: AMCL  
- `odom→base_footprint`: wheel odom / EKF (one publisher)  
- Static: URDF + `robot_state_publisher`

**Pose pipeline to Host**

1. Gazebo model pose (world) ≈ map if `world==map`.  
2. AMCL publishes `map→odom`; composed TF → `map→base_link`.  
3. Robot gateway publishes telemetry with pose when localized.  
4. Fleet updates `Robot.PoseX/Y/Yaw` only when `LocalizationStatus == LOCALIZED` (`Robot.cs` ~155–160).  
5. Fleet Monitor reads those poses — **not** Endpoint parking coordinates.

Initial localization: AMCL `initial_pose` aligned with spawn EP-PARK-5 (Active sim launch / overlay).

---

## 4. Endpoint inventory (published map)

Full machine-readable list: `MAP_POSITION_SNAPSHOT.json` → `endpoints`.

### Highlights

| Code | Name | Type | World (x,y) | Pixel (u,v) | StorageLocation | Note |
|---|---|---|---|---|---|---|
| EP-PARK-5 | Parking A | PARK | -1.929, -0.965 | 20.00, 58.00 | — | South corridor EDGE-353 |
| EP-PARK-6 | Parking B | PARK | -1.479, -0.965 | 29.00, 58.00 | — | Same lane |
| EP-CHARGER-7 | CHARGER A | CHARGER | -1.029, -0.965 | 38.00, 58.00 | — | Same lane |
| EP-WAYPOINT-1 | Inbound Area | WAYPOINT | 1.745, 1.627 | 93.48, 6.16 | — | Business dest |
| EP-WAYPOINT-2 | Outbound Area | WAYPOINT | 1.911, -1.079 | 96.8, 60.28 | — | |
| EP-WAYPOINT-3 | Inspection Quality | WAYPOINT | 1.645, -1.08 | 91.48, 60.3 | — | |
| EP-WAYPOINT-4 | Wait Point | WAYPOINT | 1.296, 0.85 | 84.5, 21.7 | — | Near EDGE-362 spur |
| EP-WAYPOINT-8..10 | Shelf-A-01..03 | WAYPOINT | x=-1.25, y varies | ~33.58, … | LOC-WH42-S01..S03 | Aisle EDGE-359 |
| EP-WAYPOINT-11 | Shelf-A-04 | WAYPOINT | -1.25, 1.664 | 33.58, 5.42 | **none** | |
| EP-WAYPOINT-14..17 | Shelf-B-* | WAYPOINT | ~0.58–0.85, y north | ~70–76, … | **none** | No SL binding |
| EP-WAYPOINT-12 | Shelf-C-01 | WAYPOINT | 0.8, -0.771 | 74.58, 54.12 | LOC-WH42-S04 | Spur EDGE-361 |
| EP-WAYPOINT-13 | Shelf-C-02 | WAYPOINT | 0.8, -0.99 | 74.58, 58.5 | none | On south lane |

**StorageLocation 1:1 (seeded for WH-42)**

| Location | Endpoint |
|---|---|
| LOC-WH42-S01 | EP-WAYPOINT-8 Shelf-A-01 |
| LOC-WH42-S02 | EP-WAYPOINT-9 Shelf-A-02 |
| LOC-WH42-S03 | EP-WAYPOINT-10 Shelf-A-03 |
| LOC-WH42-S04 | EP-WAYPOINT-12 Shelf-C-01 |

Job planning resolves StorageLocation → bound Endpoint world pose (not a separate visual marker). Inbound has **no** StorageLocation FK.

**Suspicious / intentional geometry notes (not auto-fixed)**

- Shelf-A at `x=-1.25` = lane centre of EDGE-359 (snap ≤0.5 m). May look “wrong” vs physical shelf face / Gazebo decorative racks.  
- Parks on corridor `y≈-0.965` (EDGE-353) rather than a deep bay — clearance-driven.  
- Validation `isValid=false`: many lanes report insufficient clearance vs occupancy — impacts Nav2, not Monitor math.

Key edges (snapshot): EDGE-353 south park corridor; EDGE-359 Shelf-A aisle; EDGE-361 Shelf-C spur; EDGE-355/356 east spine.

---

## 5. The five positions — SIM-01 vs Parking A

| Pose | Value at audit | Evidence |
|---|---|---|
| 1 Endpoint Parking A | `(-1.929, -0.965)`, yaw `-π/2` | DB / snapshot |
| 2 Compiled | Station at Endpoint or foot on EDGE-353 (≤0.5 m) | Compile rules; persisted pose unchanged |
| 3 Gazebo GT | **UNVERIFIED** this pass (no fresh `gz` dump at idle spawn) | Config says spawn = park |
| 4 ROS localized | Feeds telemetry when LOCALIZED | AMCL + TF |
| 5 Fleet marker | `(-2.114, -0.988)`, yaw `≈2.35` | `fleet.robots` live |

**Δ(telemetry − Park A) ≈ 0.186 m**, mostly **−X (west / left on map)**.  
`navigationStatus=FAILED`, `localizationStatus=LOCALIZED`, `isOnline=true`.

**Why SIM-01 appears left of Parking A**

| Hypothesis | Verdict |
|---|---|
| Spawn not at Parking A | **Contradicted** — `sim_endpoints.json` + layout `EP-PARK-5` |
| Wrong parking assignment | **Contradicted** — single sim robot on V001 |
| MapVersion mismatch | **Contradicted** — robot + layout + Host assets aligned |
| Editor/Monitor formula disagreement | **Unlikely sole cause** — both use same world coords |
| Marker anchor fudge | **Unlikely** for ~0.19 m |
| Stale offline pose | **Contradicted** — online LOCALIZED |
| Post-FAILED leftover after westbound collision | **VERIFIED / LIKELY** — prior E2E `CONTROLLER_FAILED` on west dead-end; telemetry left west of park |

Fleet Monitor draws the robot where the backend pose is. The visual offset matches telemetry, not a Parking marker bug.

---

## 6. Map Editor vs Fleet Monitor comparison

| Aspect | Map Editor | Fleet Monitor |
|---|---|---|
| Image | `previewImageUri` | Same |
| Meta | MapVersion resolution/origin/size | Same |
| Draw | Image pixels + `worldToPixel` | Metres + `X/Y` |
| Shared module | `mapCoordinateTransform.ts` for all geometry | Bounds via `boundsFromMapMeta` only |
| Y convention | Image v down; ROS Y via `H-v` | SVG Y via `maxY-y` |
| Zoom/pan | CSS on image stage | CSS on metre SVG stage |

### Reference table (computed; screen CSS px **UNVERIFIED**)

| Endpoint | DB (x,y) | Expected pixel (u,v) | Editor render | Monitor render | Δ px / Δ m |
|---|---|---|---|---|---|
| Parking A | -1.929, -0.965 | 20.00, 58.00 | world→pixel | world→SVG X/Y | Expected 0 if same MV |
| Parking B | -1.479, -0.965 | 29.00, 58.00 | same pipeline | same | Expected 0 |
| Inbound | 1.745, 1.627 | 93.48, 6.16 | same | same | Expected 0 |
| Shelf-A-01 | -1.25, 0.604 | 33.58, 26.62 | same | same | Expected 0 |
| Shelf-B-01 | 0.793, 1.695 | 74.44, 4.80 | same | same | Expected 0 |
| Shelf-C-01 | 0.8, -0.771 | 74.58, 54.12 | same | same | Expected 0 |
| Wait | 1.296, 0.85 | 84.5, 21.7 | same | same | Expected 0 |

Exact browser CSS pixel deltas across different viewport sizes were **not** measured from screenshots in this audit. Normalize by world metres or image (u,v) before comparing screenshots.

Dev aid: `MapAlignDebugOverlay.tsx` compares PARK vs telemetry with `worldToPixel` (no fudge).

---

## 7. Robot parking initialization chain

```text
EP-PARK-5 (DB)
  → warehouse_layout.yaml spawn_endpoint_code: EP-PARK-5
  → sim_endpoints.json spawn (-1.929, -0.965, -π/2)
  → generate_warehouse / launch spawn + AMCL initial_pose
  → TF map→base_link
  → MQTT telemetry → fleet.robots Pose*
  → WarehouseMap robot marker
```

Parking A/B are **real** initialization / service Endpoints (PARK type), not decorative-only UI.  
SIM Active uses Parking A as spawn. Parking B is a second PARK Endpoint (no second robot assigned in this audit).

Hardcoded / stale risks checked:

- Active layout points at V001 id/code (not V019).  
- `demo_map_v6/v7` layouts exist but are **not** the Active WH42 path under audit.  
- Robot id `RBT-SIM-01` / Guid `1a9cfd7b-…` bound to warehouse WH-42 and MapVersion V001.

---

## 8. Business dashed line vs navigation route

**Dashed line on Fleet Monitor** = TransportRequest **movement** overlay: straight line from pick Endpoint to drop Endpoint.

Code: `WarehouseMap.tsx` lines 559–578 (`movements.map` → `<line strokeDasharray=… markerEnd=…>`).

It is **not**:

- Nav2 planned path  
- Compiled RouteGraph  
- Authorized traffic segments  
- Recorded trajectory  

A dashed segment that crosses walls only means the business OD pair is drawn as a straight OD link. Real routing uses RouteGraph + Traffic + Nav2 along lanes.

Actual route rendering on the Monitor (authorized edges / path polyline) is separate layering (edges from scene / API); do not equate it with the movement dash.

---

## 9. Ranked discrepancy findings

### F-01 — Robot not at Parking A on Monitor  
- **Confidence:** VERIFIED  
- **Entities:** RBT-SIM-01, EP-PARK-5, MapVersion V001  
- **Evidence:** `pose ≈ (-2.114,-0.988)` vs park `(-1.929,-0.965)`; status FAILED  
- **Error:** ~0.186 m  
- **Impact:** Visual misalignment; traffic seed pose may start off park  
- **Cause class:** Runtime leftover pose after failed nav (not Editor transform)  
- **Recommended:** Respawn / reset at EP-PARK-5 before alignment judgment  

### F-02 — Shelf-A Endpoints on aisle centre  
- **Confidence:** LIKELY (product intent vs geometry)  
- **Entities:** EP-WAYPOINT-8..11, EDGE-359  
- **Evidence:** shared `x=-1.25`; validation status in snapshot  
- **Impact:** Looks “misplaced” vs shelf face; planning goals are aisle service poses  
- **Cause class:** Source data / snap-to-lane product choice  
- **Recommended:** Decide bay-face vs lane-centre semantics; redraw DRAFT if faces required  

### F-03 — Insufficient occupancy clearance on lanes  
- **Confidence:** VERIFIED (`isValid=false`, clearance Errors)  
- **Impact:** Nav2 `CONTROLLER_FAILED` / collision ahead; Traffic validation quarantine risk  
- **Cause class:** Map calibration / lane geometry vs PGM  
- **Recommended:** Fix lane widths/paths on DRAFT before expecting E2E success  

### F-04 — Dual frontend draw spaces (pixel vs metre)  
- **Confidence:** VERIFIED as architecture; **LIKELY** low bug risk at yaw=0  
- **Files:** `mapCoordinateTransform.ts`, `WarehouseMap.tsx`, `MapEditorCanvas.tsx`  
- **Impact:** Future yaw≠0 or mismatched bounds could diverge  
- **Recommended:** Keep single formula module; add cross-UI regression using worldToPixel vs X/Y  

### F-05 — Incomplete StorageLocation bindings  
- **Confidence:** VERIFIED  
- **Entities:** Shelf-B-*, Shelf-A-04, Shelf-C-02 unbound  
- **Impact:** Job planning cannot target unbound shelves via StorageLocation  
- **Cause class:** Seed / data completeness  

### F-06 — Sample GeoJSON corruption  
- **Confidence:** VERIFIED  
- **Path:** `samples/maps/MAP-WH42CFE65F-V001/route-graph.geojson`  
- **Impact:** False coordinate conclusions if used  
- **Recommended:** Regenerate sample export when documentation is updated (out of scope for this audit)  

### F-07 — Gazebo decorative shelves ≠ occupancy  
- **Confidence:** LIKELY  
- **Evidence:** `generate_warehouse.py` / layout props warned as non-occupancy truth  
- **Impact:** Visual “wall through rack” confusion  
- **Cause class:** Visualization vs navigable free space  

---

## 10. What is *not* broken (verified)

1. Map Editor and Fleet Monitor share the **same MapVersion image and ROS world frame** for V001.  
2. Pixel↔world formula matches Nav2 occupancy convention and unit tests (`mapCoordinateTransform.test.ts`).  
3. Active Gazebo/Nav2 config targets **V001**, not leftover V019 codes in the Active overlay/layout.  
4. Compile snap does **not** mutate persisted Endpoint rows.  
5. Dashed OD line is business visualization only.

---

## 11. Recommended fix order (documentation only)

1. Reset robot to EP-PARK-5; re-check Monitor vs Park (clears F-01 visual).  
2. Resolve clearance Errors on V001 DRAFT (F-03) before further E2E.  
3. Product decision: parking/shelf face vs lane centre (F-02).  
4. Complete StorageLocation bindings if Shelf-B/C needed for jobs (F-05).  
5. Optionally unify Monitor overlays through `worldToPixel` for debug parity (F-04).  
6. Refresh sample GeoJSON artifacts (F-06).

---

## 12. Source index (primary)

| Topic | Path |
|---|---|
| Pixel↔world | `web/src/shared/map/mapCoordinateTransform.ts` |
| Bounds | `web/src/shared/map/mapBounds.ts` |
| Map Editor canvas | `web/src/features/maps/editor/MapEditorCanvas.tsx` |
| Fleet Monitor map | `web/src/shared/map/WarehouseMap.tsx` |
| Align debug | `web/src/features/robots/MapAlignDebugOverlay.tsx` |
| RouteGraph attach | `backend/src/Modules/Navigation/RouteGraph/RouteGraphBuilder.cs` |
| Snap options | `backend/src/Modules/Navigation/RouteGraph/RouteGraphModels.cs` |
| Occupancy cells | `backend/src/Modules/Navigation/Traffic/OccupancyGrid.cs` |
| Fleet pose update | `backend/src/Modules/Fleet/Entities/Robot.cs` |
| Sim layout / spawn | `warotrans/.../config/warehouse_layout.yaml`, `sim_endpoints.json` |
| World==map | `warotrans/.../scripts/generate_warehouse.py` |
| Snapshot | `docs/audits/MAP_POSITION_SNAPSHOT.json` |
| Q&A findings | `docs/audits/MAP_ALIGNMENT_FINDINGS.md` |

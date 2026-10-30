# MAP alignment findings — MAP-WH42CFE65F-V001

Companion to `MAP_COORDINATE_MAPPING_FULL_AUDIT.md` and `MAP_POSITION_SNAPSHOT.json`.  
Read-only audit. No fixes applied.

## Direct answers

### 1. Are Map Editor and Fleet Monitor using the same coordinate system?

**Same world frame (`map` metres) and same MapVersion metadata / preview image URI. Different draw pipelines.**

| Layer | Map Editor | Fleet Monitor (`WarehouseMap`) |
|---|---|---|
| Image asset | `previewImageUri` via `resolveMapAssetUrl` | Same |
| Meta | `resolution`, `origin*`, `image*Pixels` from MapVersion | Same via `useMonitorMapVersion` / `boundsFromMapMeta` |
| Draw space | Image pixels `(u,v)` + `worldToPixel` / `pixelToWorld` | World metres with `X=x-minX`, `Y=maxY-y` |
| Shared module | `mapCoordinateTransform.ts` for every marker/click | Transform only for **bounds AABB**; markers use metre viewBox |

**Conclusion:** They agree on ROS world coordinates. They do **not** share one pixel-path for drawing. For yaw=0 maps that is mathematically equivalent if bounds come from `boundsFromMapMeta`.

### 2. Are their pixel-to-world formulas correct?

**YES for the shared ROS continuous formula** (verified against unit tests + Nav2 occupancy convention):

```text
localX = u * resolution
localY = (imageHeightPixels - v) * resolution
worldX = originX + cos(yaw)*localX - sin(yaw)*localY
worldY = originY + sin(yaw)*localX + cos(yaw)*localY
```

Source: `web/src/shared/map/mapCoordinateTransform.ts` lines 15–74.  
For V001 `originYaw=0`, worked example Parking A `(-1.929,-0.965)` → pixel `(20.00, 58.00)`.

Fleet Monitor does not re-run `pixelToWorld` per marker; it places markers in metres. That is correct **if** the occupancy image is stretched with `preserveAspectRatio="none"` into the metre viewBox (it is — `WarehouseMap.tsx` ~334–344).

**Limitation:** Exact browser CSS pixel positions were **not** measured from live screenshots in this audit (UNVERIFIED screen deltas). World↔image numbers above are computed from DB + formula.

### 3. Are Endpoints stored at the intended positions?

**Partially.**

- **Parking A/B + Charger** sit on south corridor EDGE-353 (`y≈-0.965`). This matches current sim spawn after corridor relocation. Relative to an earlier “bay” pose at `y≈-0.495`, they were **moved** for clearance (history of geometry hardening) — business “parking bay” vs lane centre may still disagree visually with rack drawings.
- **Shelf-A-*** were forced onto `x=-1.25` (EDGE-359) so RouteGraph snap ≤0.5 m. That is **lane-centre service poses**, not necessarily shelf-face poses from the original editor intent.
- **Inbound / Outbound / QC / Wait** remain WAYPOINT types with stored world coords; no StorageLocation on Inbound.

### 4. Do compiled graph nodes preserve business destinations?

**Persisted Endpoint `(x,y)` is unchanged by compile.**  
`RouteGraphBuilder.AttachEndpoint` may:

1. Attach code to an existing lane node if within vertex tolerance (0.05 m), or  
2. Add a **connector** from perpendicular foot → Endpoint node at the **same** `(x,y)`, or  
3. Attach via junction zone portal.

Snap distance default **0.5 m** (`RouteGraphModels.cs`).  
Compile does **not** UPDATE `navigation.endpoints`. Nav2 goals still target Endpoint world pose / station node at that pose.

### 5. Why is SIM-01 not exactly at Parking A?

**VERIFIED primary cause: robot telemetry pose ≠ Parking A after a failed navigate, not a Map Editor transform bug.**

| Source | Value |
|---|---|
| EP-PARK-5 (DB) | `(-1.929, -0.965)`, yaw `-π/2` |
| Configured Gazebo/AMCL spawn | same as EP-PARK-5 (`sim_endpoints.json`, `sim_bringup.launch.py` `initial_pose.*`) |
| `fleet.robots` telemetry (live) | `(-2.114, -0.988)`, yaw `≈2.35`, `navigationStatus=FAILED` |
| Δ | **~0.186 m**, mostly **−X (west / left on map)** |

Hypothesis table:

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Spawn not at Parking A | **Contradicted** | `spawn_endpoint_code: EP-PARK-5`; `sim_endpoints.spawn` matches DB |
| Wrong Parking assignment | **Contradicted** | Robot map = V001; only one sim robot |
| Frontend world→screen bug | **Unlikely as sole cause** | Editor/Monitor use same world coords; offset matches DB telemetry west of park |
| Marker anchoring offset | **Unlikely ~0.19 m** | Monitor robot circle centered on pose; no large fixed pixel fudge |
| Stale telemetry | **Contradicted** | `isOnline=true`, `LOCALIZED`, recent updates during audit |
| MapVersion mismatch | **Contradicted** | Host robot, gateway overlay, layout all `MAP-WH42CFE65F-V001` |
| Localization drift alone | **Partial** | AMCL started at park; current pose is after motion |
| Post-failure leftover pose | **VERIFIED / LIKELY** | Prior E2E: robot drove west on EDGE-353 then `CONTROLLER_FAILED` (collision ahead). Telemetry left at `x≈-2.11` |

**Fleet Monitor draws the robot where the backend says it is.** Left-of-Parking-A on the map is consistent with that pose, not with a wrong Parking marker.

### 6. Why do some Shelf Endpoints look misplaced?

**LIKELY geometric / intentional lane snap, not Monitor-only rendering.**

- Shelf-A codes share `x=-1.25` on EDGE-359 (aisle).  
- Visual rack rectangles in `warehouse_layout.yaml` are decorative Gazebo props (`x0..x1` around −1.55…−1.15) and **warned** “no occupied cell inside” during generate — they are not occupancy truth.  
- Editor and Monitor both plot the **same DB coordinates**, so if shelves look wrong on both, the data (or expectation of shelf-face vs aisle) is the issue.

### 7. Does Gazebo use the correct map and spawn?

**YES for current Active layout (VERIFIED config):**

- Occupancy: `maps/sim_warehouse.yaml` origin `[-2.929,-1.415]`, res `0.05` — matches MapVersion.  
- Generator contract: `world == map` (`generate_warehouse.py` docstring).  
- Spawn: overlay EP-PARK-5 → `(-1.929,-0.965)`.  
- Nav2 graph path / `map_version_code`: V001 (not V019) in `launch_sim_active.sh` + gateway overlay.

### 8. Is the mismatch visual, geometric, localization-related, or mixed?

**Combination:**

1. **Geometric / data:** corridor park + aisle-snapped shelves vs human expectation of bay/shelf-face.  
2. **Runtime pose:** robot not at park after failed nav (dominant for “SIM-01 left of Parking A”).  
3. **Visual pipeline:** Editor vs Monitor differ in draw space but agree in world metres for yaw=0.  
4. **Validation:** many `INSUFFICIENT_CLEARANCE` Errors — lanes cut occupancy; explains Nav2 “collision ahead”.  
5. **Not** a V018/V019 leftover in the Active sim config under audit.

### 9. What must be corrected, and in what order? (recommendations only)

1. **Reset / respawn** SIM-01 at EP-PARK-5 (or teleop home) before judging Monitor alignment.  
2. **Decide product semantics:** parking/shelf Endpoints = bay face vs lane centre; redraw Edges/Endpoints on a DRAFT and republish if faces are required.  
3. **Clearance:** fix lanes that report 0 m clearance before expecting Nav2 success.  
4. **Keep** Map Editor / Monitor on shared `mapCoordinateTransform` for any new pixel overlays; avoid dual formulas.  
5. **Do not** treat dashed TR lines as Nav2 paths (they are business endpoint–endpoint links).

## Confidence legend used above

- **VERIFIED** — DB/config/code + numeric consistency.  
- **LIKELY** — strong evidence, incomplete live Gazebo GT sample in this pass.  
- **UNVERIFIED** — screenshot CSS pixel deltas, live AMCL vs GT at park after clean spawn without prior motion.

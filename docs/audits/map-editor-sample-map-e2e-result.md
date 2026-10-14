# Map Editor Sample Map E2E — Result

**Date:** 2026-10-14  
**Scope:** Admin Facility → real ROS import → image-space Map Editor → Endpoint/Edge/Zone CRUD with continuous pixel↔world transform and GeoJSON world meters. Includes raster fidelity, Edge/Zone browser drawing, edge width, and endpoint yaw.

## Final status (eight items)

| # | Check | Status |
|---|--------|--------|
| 1 | Preview raster fidelity | **PASS** |
| 2 | Endpoint browser CRUD | **PASS** |
| 3 | Endpoint yaw rendering | **PASS** |
| 4 | Edge browser CRUD/drawing | **PASS** |
| 5 | Zone browser CRUD/drawing | **PASS** |
| 6 | API CRUD | **PASS** |
| 7 | F5 reconstruction | **PASS** |
| 8 | Coordinate round-trip | **PASS** |

**Overall:** **PASS** (all eight).

No changes were made to GeoJSON storage, world-meter persistence, `H - v`, `cellCenterToWorld`, import architecture, or preview URLs. Converter code was not altered (source PGM is binary and PNG matches it).

---

## PGM Raster Verification

### Source file: `web/public/test-maps/sample/map.pgm`

| Field | Value |
|-------|--------|
| Format | **P5** (binary grayscale) |
| Dimensions | **1192 × 918** |
| Max value | **255** |
| Data length | 1,094,256 bytes (= W×H) |
| Unique grayscale values | **2** |

### Histogram (source PGM)

| Value | Count | Share | Role for this fixture |
|-------|------:|------:|------------------------|
| `0` (black / dark) | 282,576 | 25.8% | Occupied-looking |
| `255` (white / free-like) | 811,680 | 74.2% | Free-looking |
| `1..254` (gray / unknown-like) | **0** | 0% | **None** |

**Unknown pixels:** do **not** exist in this fixture. There is no mid-gray band (e.g. classic ROS unknown ≈ 205). This sample is a true black/white occupancy raster.

### Generated preview PNG

Path under Host: `data/maps/576cc218-…/b6742c8f-…/map-preview.png`

| Field | Value |
|-------|--------|
| Size | 1192 × 918 |
| Bit depth / color type | 8-bit grayscale (color type 0) |
| Histogram | `{0: 282576, 255: 811680}` |
| Pixel mismatches vs PGM | **0** |

Encoder [`PgmParser.ToPreviewPng`](../../backend/src/Modules/Navigation/Services/PgmParser.cs): identity map for maxval=255; optional rescale when maxval≠255; invert only when `negate=1`. **No thresholding to binary.**

**Verdict: FAITHFUL.** The black/white Map Editor screenshot is a faithful representation of this sample source. Gray areas were **not** invented. No converter fix required.

Regression unit tests added: `PgmParser_PreviewPreservesGrayscaleAndAppliesNegate`, `PgmParser_PreviewScalesWhenMaxValueIsNot255` (values `0,127,205,254,255` + negate + maxval=100).

---

## ROS map.yaml semantics (display ≠ classification)

From `web/public/test-maps/sample/map.yaml`:

```yaml
negate: 0
occupied_thresh: 0.65
free_thresh: 0.196
# mode: absent → ROS default trinary
```

With `negate: 0`, occupancy probability `p = (255 − v) / 255`:

| Condition | Class | This fixture |
|-----------|--------|--------------|
| `p > occupied_thresh` (0.65) | occupied | `v=0` → p=1.0 → occupied |
| `p < free_thresh` (0.196) | free | `v=255` → p=0.0 → free |
| otherwise | unknown | no pixels |

**Web preview:** preserve raster appearance (grayscale fidelity).  
**Future traffic/occupancy logic:** classify using YAML thresholds. These are separate concerns.

---

## Coordinate convention

```text
localX = u * res
localY = (H - v) * res
(0, H) → origin
```

Sample: 1192×918, `res=0.037721614`, origin `(-5,-5,0)`.  
Editor snaps world poses to 1 mm → expected max quantization ≈ **0.0133 px** per axis.

---

## Live API (verified)

Script: `tools/map-editor-sample-e2e.mjs` (`--detail <mapId>` for browser evidence dumps).

| Step | Result |
|------|--------|
| Import sample | `MAP-WH576CC218-V002` DRAFT 1192×918 |
| Preview PNG | `200 image/png` |
| Endpoint/Edge/Zone create from fractional pixels | OK |
| Round-trip pixel error (Endpoint) | **0** |
| Round-trip pixel error (Edge) | max **5.684e-14** |
| Round-trip pixel error (Zone) | max **5.684e-14** |
| Update + Delete | confirmed absent |

---

## Live browser — Edge drawing (CRUD)

Map: `b6742c8f-7b29-48d6-9f04-19631d0c9f61` (`EDGE-107`).

| Step | Evidence |
|------|----------|
| Tool | Edge → One-way → 3 clicks → toolbar **Finish** |
| Initial image coords (app-seen draft) | `(218.973, 258.643)`, `(379.252, 298.726)`, `(539.532, 338.783)` |
| Persisted world (m) | `(3.260, 19.872)`, `(9.306, 18.360)`, `(15.352, 16.849)` |
| Properties saved | Direction=`ONE_WAY`, Capacity=`2`→edited`3`, WidthMeters=`1.0`, MaxSpeed=`0.5`, IsActive=`true` |
| F5 reloaded image coords | identical to draft (max pixel error **0**) |
| Edit Capacity→3, Save, F5 | API `capacity: 3` |
| Delete, F5 | absent from DOM and API |

---

## Live browser — Edge width visual

| Check | Result |
|-------|--------|
| `stroke-width` attribute | `1.0 / 0.037721614` = **26.510000340918605** (exact) |
| Zoom 1 → screen body height | 43.998 px |
| After 2× Zoom in (`scale(1.5625)`) | screen height 68.747 px; ratio **1.5625** |
| `widthMeters` after zoom | still **1.0** (domain unchanged) |

---

## Live browser — Zone drawing (CRUD)

| Step | Evidence |
|------|----------|
| Tool | Zone → **Intersection** → 4 vertices → **Finish** |
| Initial image coords (draft polygon) | `(249.936, 398.881)`, `(399.294, 398.881)`, `(399.294, 519.104)`, `(249.936, 519.104)` |
| Persisted world (m) | `(4.428, 14.582)`, `(10.062, 14.582)`, `(10.062, 10.047)`, `(4.428, 10.047)` (+ closed ring) |
| Policy UI | Preferred yaw **90°**, Heading tol **10°** |
| API policy | `preferredDirectionYaw: 1.5707963267948966`, `headingToleranceRadians: 0.17453292519943295` |
| F5 reloaded polygon points | identical (max pixel error **0**) |
| Rename → Save → Delete → F5 | absent |

---

## Live browser — Endpoint yaw

| Step | Evidence |
|------|----------|
| UI | Face N (**90°**) → Save |
| API `yaw` | **1.5707963267948966** (= π/2) |
| After F5 | heading `<line transform="rotate(-90)">` |
| Tip vs center (screen) | tip **above** center (`deltaY ≈ −9.88`, `deltaX = 0`) → +Y world / north in image space |
| Delete | confirmed |

Prior Endpoint CRUD (create / F5 / rename / delete) from the earlier pass remains valid.

---

## CI-equivalent results

| Check | Result |
|-------|--------|
| Backend Release build | Pass |
| Unit tests (`MapImportAndMetadataTests` incl. grayscale) | 5 passed |
| Unit tests (`Navigation` filter, prior) | 100 passed |
| Architecture tests | 11 passed |
| Integration tests (`Navigation`) | 34 passed |
| Web lint / typecheck / vitest / build | Pass |

---

## What changed (implementation summary)

| Area | Change |
|------|--------|
| Rules | GeoJSON contract in `rules/05` |
| Fixture | `web/public/test-maps/sample/` |
| Backend | `DeleteEndpoint`; public `/map-assets` |
| Tests | Zone/Import/Endpoint-delete integration; PGM grayscale preservation unit tests |
| Transform | Continuous `H - v`; `cellCenterToWorld` separate |
| Editor | Image-space SVG; per-entity CRUD; deg↔rad |
| Facility | Warehouse selector; DEV Load Sample Map |
| Tools | `tools/map-editor-sample-e2e.mjs` + `--detail <mapId>` |

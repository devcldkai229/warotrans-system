# 10 — Uncertainties and Corrections

**Audit date:** 2026-11-03

---

## Assumed packages not actually present

| Assumption | Reality |
|---|---|
| Separate AdminWeb + StaffWeb browser apps | One Vite SPA `web` + Expo mobile `app` |
| Shared frontend monorepo `packages/*` | None |
| Classic Clean Architecture Domain/Application/Infrastructure projects | Vertical-slice Features inside modules |
| Separate C# Traffic project | Traffic lives in Navigation (compile) + Fleet (runtime) |
| Classic `.sln` | Only `WaroTrans.slnx` |
| Feature folders `receiving`, `containers`, `issues` (rules examples) | Not on disk under `web`/`app` |
| Next.js app | Not present |
| Additional ROS packages beyond the 13 listed | Not under `ros2_ws/src` |

---

## Logical groupings vs source namespaces

| Name | Type |
|---|---|
| WaroTrans / UserApplications / Backend / RobotEdge | Logical UML groupings only |
| `web.app`, `web.features`, `web.shared` | Directory-based packages under `web/src` (not npm packages) |
| `Navigation.RouteGraph`, `Fleet.Traffic` | Folders/namespaces inside modules, not `.csproj` |

---

## Outdated / dual-mode components

| Component | Correction |
|---|---|
| RouteGraph “retired” | **Incorrect if absolute.** RouteGraph remains active for compile/export; Semantic mode avoids RouteGraph A\* for live grants |
| LaneAwareNavfn as sole planner | Default Nav2 params use Navfn; LaneAware is overlay |
| `warotrans_perception` as active perception stack | Scaffold only |
| Hard RouteGraph deletion from codebase | Not done (and should not be implied) |

---

## Naming mismatches

| Diagram-friendly name | Real name |
|---|---|
| AdminWeb | `web` / `warotrans-web` |
| StaffWeb / StaffWebMobile | `app` / `warotrans-app` (mobile; Expo web is preview only) |
| API / Gateway project | `WaroTrans.Host` |
| CommonKernel | `WaroTrans.BuildingBlocks` |
| MQTT Gateway ROS package | `warotrans_fleet` (node `robot_gateway_node`) |
| Authority Gate | executable in `warotrans_fleet` (`cmd_vel_authority_gate`), not its own ROS package |

---

## Missing or unclear dependencies

| Item | Status |
|---|---|
| Does `warotrans_bringup` actually launch `fleet.launch.py`? | **UNKNOWN** — `exec_depend` present; Include not found in inspected launches |
| Production default `TrafficCoordinatorMode` | Code default **Shadow**; whether ops run Semantic is **UNKNOWN** without deployment config audit |
| Exact SignalR event parity web vs app | Partially verified; app registers more handler names |
| Whether unused `web/src/app/home-page.tsx` / `layout.tsx` are live routes | **UNKNOWN** — primary routing is `App.tsx` + feature pages |
| `JobProvisionDemo` role in product architecture | Tool outside slnx — omit from product diagrams |

---

## Architecture documentation conflicting with code

Prior docs/audits often emphasize RouteGraph deeply (still valid as compile substrate) while simulation acceptance docs discuss Semantic stages that bypass RouteGraph A\*. Diagrams must show **both** without claiming exclusive retirement.

Frontend rules may list aspirational feature folders not present — use on-disk folders only.

---

## Areas requiring manual confirmation

1. Production Traffic mode (Shadow vs Active vs Semantic) in deployed environments.  
2. Whether robot bringup always starts MQTT gateway / authority gate.  
3. Whether LaneAware overlay is standard on physical robots.  
4. Deployment topology for admin SPA (same-origin proxy vs absolute API URL).  
5. Whether firmware sketches are considered in-scope for SDD Robot Edge package diagrams (recommended: external note only).

---

## Integrity statement

This audit did not modify application code, maps, databases, ROS configs, or runtime state. Outputs are documentation under `docs/architecture/package-diagram-audit/` only.

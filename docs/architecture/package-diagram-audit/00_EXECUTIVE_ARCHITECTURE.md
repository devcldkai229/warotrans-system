# 00 — Executive Architecture Summary

**Audit date:** 2026-11-03  
**Scope:** Read-only source inspection of `warotrans-system` and `warotrans`  
**Confidence policy:** Primary UML package diagrams use **VERIFIED** relationships only

---

## Overall software architecture

WaroTrans is a warehouse AMR fleet system split across **two repositories**:

| Repository | Role | Primary technologies (VERIFIED) |
|---|---|---|
| `warotrans-system` | Management plane: user apps + modular monolith backend | React/Vite admin web, Expo React Native staff app, ASP.NET Core **.NET 10**, PostgreSQL (EF Core/Npgsql), MongoDB (Operations), MQTT, SignalR |
| `warotrans` | Robot edge + simulation + MCU firmware | ROS 2 workspace (`ros2_ws`), 13 ROS packages, Arduino firmware under `firmware/` |

**Architectural style (VERIFIED):**

- Backend: **modular monolith** — one Host process composes seven business modules + BuildingBlocks; vertical-slice `Features/` (not classic Domain/Application/Infrastructure folders).
- Frontends: **two independent deployable apps** (`web/`, `app/`) with **no shared npm workspace library**.
- Robot edge: **ROS 2 package graph** with Nav2, MQTT gateway, authority gate, optional LaneAwareNavfn plugin; Gazebo simulation is a separate ROS package.
- Cross-repo runtime integration: **MQTT** (fleet commands/authority/telemetry) and **HTTP/SignalR** (UIs ↔ Host). These are **runtime** relationships, not compile-time package dependencies.

---

## Actual subsystem boundaries

For SDD UML Package Diagrams, three **logical grouping packages** are used (they are **not** source folders/namespaces named this way):

1. **UserApplications** — `web` (Admin SPA) + `app` (Staff mobile)
2. **Backend** — `WaroTrans.Host` + `WaroTrans.BuildingBlocks` + modules Identity, Warehouse, Transportation, WorkflowExecution, Fleet, Navigation, Operations
3. **RobotEdge** — ROS packages under `warotrans/ros2_ws/src` (+ optional external note for non-ROS `firmware/`)

---

## Repository ownership

| Concern | Owns |
|---|---|
| Identity, warehouse master data, maps/zones/lanes compile, jobs/workflows, fleet registry, traffic coordination server-side, operations notifications | `warotrans-system` backend |
| Admin console + staff mobile UX | `warotrans-system` `web/` + `app/` |
| Local motion (Nav2), sensors, ESP32 bridge, MQTT gateway on robot, Gazebo sim | `warotrans` |
| MCU motor/encoder firmware | `warotrans/firmware` (not a ROS package) |

---

## Active vs legacy / dual-mode implementations

| Topic | Status (VERIFIED) |
|---|---|
| Backend Navigation `RouteGraph/` | **Active** compile/export substrate (`RouteGraphBuilder`, GetRouteGraph APIs, used by `TrafficGraphCompiler`) |
| Fleet `TrafficCoordinatorMode.Semantic` | **Active code path** that avoids RouteGraph A\* for live grants; default options mode is **Shadow** (config-dependent whether Semantic is production default — UNKNOWN at ops level) |
| Segmented / RouteGraph-based traffic coordinators | Still present alongside Semantic |
| Frontend AdminWeb + StaffWeb as two web apps | **Not present** — one Vite SPA (`web`) + one Expo app (`app`) |
| Shared frontend `packages/*` | **Not present** |
| Classic `.sln` | **Absent** — solution is `backend/WaroTrans.slnx` |
| Clean Architecture Domain/Application/Infrastructure folders | **Not used**; Features + Entities + Persistence pattern |
| `warotrans_perception` | Scaffold (empty console_scripts) |
| LaneAwareNavfn as default robot planner | Default `nav2_params.yaml` uses Navfn; LaneAware is an **overlay** (`nav2_params_lane_aware.yaml`) |

---

## Important discrepancies vs common prior assumptions

1. **Do not draw AdminWeb and StaffWeb as two browser packages** — draw `web` and `app`.
2. **Do not invent a separate Traffic C# project** — traffic compile lives in Navigation; runtime coordination lives in Fleet.
3. **Do not claim RouteGraph is retired** — it remains active for graph compile/export; Semantic mode changes *runtime grant planning*, not deletion of RouteGraph.
4. **Do not treat PostgreSQL / MongoDB / MQTT broker / Gazebo / motors as UML application packages** — show them as external runtime nodes only if needed in a separate deployment view.
5. **UserApplications / Backend / RobotEdge are logical UML outer packages**, not literal source packages.
6. **Backend Navigation does not execute robot local path planning** — Nav2 / LaneAwareNavfn on the robot does; backend owns map policy compile and (via Fleet) reservation/authority over MQTT.

---

## Technology stack (VERIFIED highlights)

- **.NET:** `net10.0` across backend projects
- **Web:** React 19, Vite 8, React Router 7, TanStack Query, Tailwind 4, SignalR client
- **Mobile:** Expo ~57, React Native 0.86, TanStack Query, SignalR client
- **ROS:** packages under `ros2_ws/src` (ament_cmake / ament_python); Nav2; pluginlib LaneAwareNavfn
- **Persistence:** EF Core + Npgsql per business module (except Operations → MongoDB)
- **Messaging:** MQTT via BuildingBlocks + Fleet ingress; SignalR hub on Host

---

## Audit integrity

- No application source, configuration, maps, databases, or ROS behavior were modified for this audit.
- Documentation written only under `docs/architecture/package-diagram-audit/`.

# 02 — Overall Package Model

**Priority document for SDD overall UML Package Diagram.**  
**Audit date:** 2026-11-03

---

## Logical vs literal packages

| Name | Kind | Meaning |
|---|---|---|
| `WaroTrans` | Logical root grouping | Entire product for diagram framing |
| `UserApplications` | **Logical** UML grouping | Not a source folder |
| `Backend` | **Logical** UML grouping | Not a source folder / namespace |
| `RobotEdge` | **Logical** UML grouping | Not a single ROS package |
| `web`, `app` | **Literal** deployable frontend packages | `warotrans-system/web`, `.../app` |
| `WaroTrans.*` C# projects | **Literal** packages | `.csproj` + default namespaces |
| `warotrans_*` ROS packages | **Literal** packages | `package.xml` names |

**Rule for diagrams:** Label logical groupings with a stereotype or note such as `«logical grouping»`. Do not invent matching source directories.

---

## Top-level package hierarchy (VERIFIED contents)

```text
WaroTrans «logical»
├── UserApplications «logical»
│   ├── web                    (warotrans-web — Admin Vite SPA)
│   │   ├── web.app
│   │   ├── web.features.*
│   │   └── web.shared.*
│   └── app                    (warotrans-app — Staff Expo RN)
│       ├── app.app.*
│       ├── app.features.*
│       └── app.shared.*
│
├── Backend «logical»
│   ├── WaroTrans.Host
│   ├── WaroTrans.BuildingBlocks
│   ├── WaroTrans.Identity
│   ├── WaroTrans.Warehouse
│   ├── WaroTrans.Transportation
│   ├── WaroTrans.WorkflowExecution
│   ├── WaroTrans.Fleet
│   ├── WaroTrans.Navigation
│   └── WaroTrans.Operations
│
└── RobotEdge «logical»
    ├── warotrans_msgs
    ├── warotrans_description
    ├── warotrans_hardware
    ├── warotrans_sensors
    ├── warotrans_localization
    ├── warotrans_slam
    ├── warotrans_navigation
    ├── warotrans_lane_planner
    ├── warotrans_fleet
    ├── warotrans_teleop
    ├── warotrans_perception
    ├── warotrans_bringup
    └── warotrans_simulation   (simulation-only)
```

**Optional external (non-package for primary UML):** `firmware` (Arduino) — document in Robot Edge notes, not as a ROS package.

**Optional test packages (omit from product overall diagram unless needed):** `WaroTrans.UnitTests`, `WaroTrans.ArchitectureTests`, `WaroTrans.IntegrationTests`.

---

## Subsystem ownership

| Subsystem | Repository | Deployable unit(s) |
|---|---|---|
| UserApplications | `warotrans-system` | Browser SPA + mobile app binaries |
| Backend | `warotrans-system` | Single Host process (modular monolith) |
| RobotEdge | `warotrans` | ROS graph on robot / sim host; firmware on MCU |

---

## Inter-subsystem dependencies

### Compile-time / import (VERIFIED) — within subsystems only

Frontend packages do **not** ProjectReference backend.  
Backend does **not** reference ROS packages.  
ROS packages do **not** reference C# projects.

### Runtime integration (document separately from UML package dashed arrows)

| Dependent | Required | Mechanism | Evidence |
|---|---|---|---|
| `web` | `WaroTrans.Host` | REST + SignalR | `web/src/shared/api/client.ts`, `web/src/shared/realtime/useNotificationsHub.ts` |
| `app` | `WaroTrans.Host` | REST + SignalR | `app/src/shared/api/client.ts`, `app/src/shared/realtime/realtimeClient.ts` |
| `WaroTrans.Fleet` / BuildingBlocks MQTT | `warotrans_fleet` | MQTT | `WaroTrans.BuildingBlocks/Mqtt/*`, `Modules/Fleet/Mqtt/RobotMqttIngress.cs`, `warotrans_fleet/robot_gateway_node.py` |

**Recommendation:** On the **overall package diagram**, either:
- omit runtime edges and show only nesting of logical subsystems, **or**
- draw runtime edges with a distinct stereotype `«runtime MQTT»` / `«runtime REST+SignalR»` and keep them visually separate from compile-time dashed UML package dependencies.

Primary SDD package diagrams should **prefer nesting + intra-subsystem compile deps**. Cross-repo runtime belongs in a companion communication/deployment view if required.

---

## Evidence for Backend inter-module compile deps (summary)

See `04_BACKEND_PACKAGE_MODEL.md` and `06_PACKAGE_DEPENDENCIES.csv`.

Core chain (ProjectReference):

```text
Host → {BuildingBlocks, Identity, Warehouse, Transportation, WorkflowExecution, Fleet, Navigation, Operations}
Transportation → {BuildingBlocks, WorkflowExecution, Warehouse, Navigation}
WorkflowExecution → {BuildingBlocks, Fleet, Navigation}
Fleet → {BuildingBlocks, Warehouse, Navigation}
Navigation → {BuildingBlocks, Warehouse}
Identity | Warehouse | Operations → BuildingBlocks
```

---

## Proposed scope of the overall UML Package Diagram

**Include:**

- Logical packages: UserApplications, Backend, RobotEdge
- Literal packages: `web`, `app`; all eight Backend production projects (Host + BuildingBlocks + 7 modules); all 13 ROS packages (optionally group simulation)

**Exclude from overall (detail elsewhere):**

- Nested `web.features.*` / `app.features.*` (User Applications subsystem diagram)
- Nested Fleet.Traffic / Navigation.RouteGraph (Backend subsystem or traffic detail diagram)
- External infra: PostgreSQL, MongoDB, MQTT broker, Gazebo, LiDAR, motors

**Nesting vs dependency:** Nesting shows containment. Dashed arrows show dependencies. Do not draw a dashed arrow from UserApplications to Backend unless explicitly marking `«runtime»`.

---

## Consistency check

| Question | Answer |
|---|---|
| Are UserApplications/Backend/RobotEdge source packages? | **No** — logical only |
| Single frontend vs split? | **Two** apps: `web` + `app` |
| Separate Traffic project? | **No** |
| RouteGraph package? | Folder/namespace under Navigation — nest as `Navigation.RouteGraph` on Backend detail diagram if needed |

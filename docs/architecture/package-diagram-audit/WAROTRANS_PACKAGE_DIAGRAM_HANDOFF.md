# WAROTRANS — Package Diagram Handoff (Self-Contained)

**Purpose:** Enable another AI (without repository access) to draw accurate UML Package Diagrams for the SDD.  
**Audit date:** 2026-11-03  
**Confidence:** Use only VERIFIED edges for primary diagrams. Items marked INFERRED/UNKNOWN/PROPOSED must not become unmarked arrows.  
**Source repos:** `warotrans-system` (management) + `warotrans` (robot edge).

---

## 0. Drawing rules (mandatory)

1. Packages = tabbed rectangles; nesting = containment; dashed arrow = dependency.  
2. Arrow direction: **dependent package → required package**.  
3. Orthogonal connectors only (horizontal/vertical, 90° turns).  
4. Do **not** draw PostgreSQL, MongoDB, MQTT Broker, Gazebo, LiDAR, motors as internal software packages.  
5. `UserApplications`, `Backend`, `RobotEdge`, `WaroTrans` are **«logical grouping»** packages — not source folders.  
6. Prefer omitting an edge over inventing one.  
7. Runtime integrations (REST/SignalR/MQTT) are **not** compile-time package dependencies; if drawn, stereotype them explicitly.

---

## 1. Architecture summary

WaroTrans is an autonomous warehouse transport system with:

- **Two frontend apps** in `warotrans-system`: Admin Vite SPA (`web`) and Staff Expo mobile (`app`).  
- **One ASP.NET Core modular monolith** (.NET 10): `WaroTrans.Host` composes BuildingBlocks + seven modules.  
- **Thirteen ROS 2 packages** in `warotrans/ros2_ws/src`, plus non-ROS Arduino firmware under `firmware/`.  
- Cross-repo runtime: UIs ↔ Host via REST+SignalR; Host/Fleet ↔ robot `warotrans_fleet` via MQTT.  
- Backend Navigation compiles maps/RouteGraph/traffic policy; Fleet coordinates runtime authority; robot Nav2/LaneAwareNavfn plans local motion.

---

## 2. Verified overall package hierarchy

```text
WaroTrans «logical»
├── UserApplications «logical»
│   ├── web
│   │   ├── web.app
│   │   ├── web.features
│   │   └── web.shared
│   └── app
│       ├── app.app
│       ├── app.features
│       └── app.shared
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
    ├── warotrans_perception          «scaffold»
    ├── warotrans_bringup
    └── warotrans_simulation          «simulation»
```

Optional external note (not ROS package): `firmware` (Arduino ESP32).

---

## 3. Package descriptions (overall)

| Package | Description |
|---|---|
| WaroTrans | Logical root of the product software. |
| UserApplications | Logical grouping of admin and staff clients. |
| Backend | Logical grouping of the ASP.NET modular monolith. |
| RobotEdge | Logical grouping of ROS 2 robot/sim packages. |
| web | Admin console SPA (React/Vite). |
| app | Staff mobile app (Expo/React Native). |
| WaroTrans.Host | Composition root; HTTP + SignalR host. |
| WaroTrans.BuildingBlocks | Shared kernel (MQTT, auth helpers, persistence utils, results). |
| WaroTrans.Identity | Auth, accounts, roles. |
| WaroTrans.Warehouse | Warehouse master data + contracts. |
| WaroTrans.Transportation | Transport requests. |
| WaroTrans.WorkflowExecution | Job/workflow execution engine. |
| WaroTrans.Fleet | Robot registry, MQTT ingress, runtime traffic coordination. |
| WaroTrans.Navigation | Maps, RouteGraph compile, traffic graph/policy compile. |
| WaroTrans.Operations | Notifications/issues/audit (MongoDB). |
| warotrans_msgs | Custom ROS messages. |
| warotrans_description | Robot URDF/description. |
| warotrans_hardware | ESP32 bridge + wheel odom. |
| warotrans_sensors | Sensor nodes. |
| warotrans_localization | Localization launch/config. |
| warotrans_slam | SLAM launch/config. |
| warotrans_navigation | Nav2 launch/config. |
| warotrans_lane_planner | LaneAwareNavfn plugin. |
| warotrans_fleet | MQTT gateway, authority gate, path policy validator. |
| warotrans_teleop | Commissioning teleop. |
| warotrans_perception | Scaffold (no nodes yet). |
| warotrans_bringup | Robot launch orchestration. |
| warotrans_simulation | Gazebo sim + semantic adapters. |

---

## 4. Verified dependency graph

### 4.1 Backend (C# ProjectReference) — VERIFIED

```text
WaroTrans.Host → WaroTrans.BuildingBlocks
WaroTrans.Host → WaroTrans.Identity
WaroTrans.Host → WaroTrans.Warehouse
WaroTrans.Host → WaroTrans.Transportation
WaroTrans.Host → WaroTrans.WorkflowExecution
WaroTrans.Host → WaroTrans.Fleet
WaroTrans.Host → WaroTrans.Navigation
WaroTrans.Host → WaroTrans.Operations

WaroTrans.Identity → WaroTrans.BuildingBlocks
WaroTrans.Warehouse → WaroTrans.BuildingBlocks
WaroTrans.Operations → WaroTrans.BuildingBlocks

WaroTrans.Navigation → WaroTrans.BuildingBlocks
WaroTrans.Navigation → WaroTrans.Warehouse

WaroTrans.Fleet → WaroTrans.BuildingBlocks
WaroTrans.Fleet → WaroTrans.Warehouse
WaroTrans.Fleet → WaroTrans.Navigation

WaroTrans.WorkflowExecution → WaroTrans.BuildingBlocks
WaroTrans.WorkflowExecution → WaroTrans.Fleet
WaroTrans.WorkflowExecution → WaroTrans.Navigation

WaroTrans.Transportation → WaroTrans.BuildingBlocks
WaroTrans.Transportation → WaroTrans.WorkflowExecution
WaroTrans.Transportation → WaroTrans.Warehouse
WaroTrans.Transportation → WaroTrans.Navigation
```

**Evidence:** respective `*.csproj` under `backend/src/`; solution `backend/WaroTrans.slnx`.

### 4.2 User Applications (TS import direction) — VERIFIED

```text
web.app → web.features → web.shared
app.app → app.features → app.shared
```

No shared npm package between `web` and `app`.

### 4.3 Robot Edge (package.xml warotrans_* deps) — VERIFIED

```text
warotrans_hardware → warotrans_msgs
warotrans_teleop → warotrans_msgs
warotrans_teleop → warotrans_hardware
warotrans_navigation → warotrans_lane_planner

warotrans_bringup → warotrans_description
warotrans_bringup → warotrans_hardware
warotrans_bringup → warotrans_teleop
warotrans_bringup → warotrans_sensors
warotrans_bringup → warotrans_localization
warotrans_bringup → warotrans_slam
warotrans_bringup → warotrans_navigation
warotrans_bringup → warotrans_perception
warotrans_bringup → warotrans_fleet

warotrans_simulation → warotrans_description
warotrans_simulation → warotrans_localization
warotrans_simulation → warotrans_navigation
warotrans_simulation → warotrans_fleet
warotrans_simulation → warotrans_lane_planner
```

**Annotated (optional, not unmarked package.xml):**

```text
warotrans_fleet → warotrans_simulation   «python import semantic_map_adapter»
warotrans_navigation → warotrans_fleet   «launch cmd_vel_authority_gate»
```

### 4.4 Runtime (stereotype if drawn)

```text
web → WaroTrans.Host                 «runtime REST+SignalR»
app → WaroTrans.Host                 «runtime REST+SignalR»
WaroTrans.BuildingBlocks/Fleet → warotrans_fleet   «runtime MQTT»
```

---

## 5. User Applications detail

### web (`warotrans-web`)

- Path: `web/`
- Stack: React 19, Vite 8, React Router 7, TanStack Query, Tailwind 4, SignalR
- Structure: `web/src/app`, `web/src/features/{accounts,auth,dashboard,jobs,management,maps,notifications,robots,transport-requests,workflows}`, `web/src/shared/{api,lib,map,realtime,ui}`
- Auth: ADMIN-gated console
- API: `/api/*`; Hub: `/hubs/notifications`

### app (`warotrans-app`)

- Path: `app/`
- Stack: Expo ~57, React Native 0.86, TanStack Query, SignalR
- Structure: `app/src/app/{navigation,providers,shell}`, `app/src/features/{auth,home,inventory,jobs,monitoring,safety,transport}`, `app/src/shared/{api,components,context,realtime,theme,types,ui,utils}`
- Features do not import other features

**Do not invent:** AdminWeb/StaffWeb as two web packages; shared `packages/*`.

---

## 6. Backend detail

- Solution: `backend/WaroTrans.slnx` (no classic `.sln`)
- TFM: `net10.0`
- Style: vertical-slice Features + Entities + Persistence (not Clean Architecture folders)
- Module registration: `AddXxxModule` / `MapXxxEndpoints` from Host `Program.cs`
- API prefixes: `/api/identity`, `/api/warehouse`, `/api/transportation`, `/api/workflow-execution`, `/api/fleet`, `/api/navigation`, `/api/operations`

### Traffic split (critical)

| Package/area | Responsibility |
|---|---|
| Navigation.RouteGraph | Topology compile/export — **ACTIVE** |
| Navigation.Traffic | Traffic graph compile/validate/cache |
| Fleet.Traffic | Runtime coordinators, authority publish/renew, Semantic reservation |
| BuildingBlocks.Mqtt | Shared MQTT DTOs/topics/client hosted services |
| Fleet.Mqtt | Robot MQTT ingress adapter |

**Do not** say Backend Navigation executes robot path planning.  
**Do not** say RouteGraph is fully retired.

### Persistence

- PostgreSQL/EF: BuildingBlocks sequences + Identity, Warehouse, Transportation, WorkflowExecution, Fleet, Navigation  
- MongoDB: Operations only

---

## 7. Robot Edge detail

### Key nodes/plugins

| Component | Package | Kind |
|---|---|---|
| robot_gateway_node | warotrans_fleet | MQTT gateway |
| cmd_vel_authority_gate | warotrans_fleet | Authority gate |
| path_policy_validator | warotrans_fleet | Path policy node |
| LaneAwareNavfn | warotrans_lane_planner | Nav2 plugin |
| semantic_map_adapter | warotrans_simulation | Sim script |
| esp32_bridge_node / wheel_odom_node | warotrans_hardware | Hardware |
| Default planner in nav2_params.yaml | external Navfn | Not LaneAware by default |
| LaneAware overlay | nav2_params_lane_aware.yaml | Optional |

### Firmware

`firmware/warotrans_low_level`, `firmware/encoder_test` — Arduino; **not** ROS packages.

---

## 8. Diagram breakdown recommendations

| Diagram | Include | Exclude |
|---|---|---|
| Overall | Logical 3 subsystems + literal top packages + backend & ROS verified deps | Feature nesting; DB/hardware; unmarked runtime |
| User Applications | web/app + app/features/shared nesting + import arrows | Backend modules |
| Backend | Host + BuildingBlocks + 7 modules + ProjectReference arrows | ROS; frontends |
| Backend Traffic detail (optional) | Navigation.RouteGraph/Traffic, Fleet.Traffic/Mqtt, BuildingBlocks.Mqtt | Full module list |
| Robot Edge | 13 ROS packages + package.xml arrows | C#; inventing Nav2/Gazebo as WaroTrans packages |

---

## 9. PlantUML sources (verified)

Use the PlantUML blocks in `09_UML_DIAGRAM_SPECIFICATION.md` (Overall, UserApplications, Backend, RobotEdge). They already set `skinparam linetype ortho`.

---

## 10. Corrections to prior diagram assumptions

1. Not AdminWeb + StaffWeb web apps → `web` + `app`.  
2. Not a separate Traffic C# project.  
3. RouteGraph not fully retired.  
4. BuildingBlocks is the shared kernel name (not invent “CommonKernel” unless labeled alias).  
5. Authority gate is an executable inside `warotrans_fleet`, not its own package.  
6. UserApplications/Backend/RobotEdge are logical, not literal.  
7. `warotrans_perception` is scaffold.  
8. LaneAware is not the unconditional default planner.

---

## 11. Uncertainties (do not silently resolve)

- Bringup declares fleet dependency but may not Include fleet.launch in current files.  
- Production TrafficCoordinatorMode (Shadow default in code).  
- Whether physical robots always use LaneAware overlay.  
- Whether firmware is in-scope for SDD package diagrams (recommend external note).

---

## 12. Companion files in this audit folder

| File | Content |
|---|---|
| `00_EXECUTIVE_ARCHITECTURE.md` | Executive summary |
| `01_REPOSITORY_INVENTORY.md` | Source trees |
| `02_OVERALL_PACKAGE_MODEL.md` | Overall model |
| `03_FRONTEND_PACKAGE_MODEL.md` | Frontend model |
| `04_BACKEND_PACKAGE_MODEL.md` | Backend model |
| `05_ROBOT_EDGE_PACKAGE_MODEL.md` | ROS model |
| `06_PACKAGE_DEPENDENCIES.csv` | Dependency rows |
| `07_PACKAGE_CATALOG.csv` | Package catalog |
| `08_PACKAGE_DESCRIPTIONS.md` | SDD description tables |
| `09_UML_DIAGRAM_SPECIFICATION.md` | Diagram specs + PlantUML |
| `10_UNCERTAINTIES_AND_CORRECTIONS.md` | Corrections |
| `WAROTRANS_PACKAGE_DIAGRAM_HANDOFF.md` | This handoff |

**Absolute path:**  
`E:\programming\my_project\warotrans-system\docs\architecture\package-diagram-audit\`

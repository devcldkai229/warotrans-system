# 08 — Package Descriptions (SDD Tables)

**Audit date:** 2026-11-03  
Descriptions use professional SDD language focused on **software responsibilities**.

---

## 1. Overall

| No. | Package | Description |
|---|---|---|
| 1 | WaroTrans | Logical root grouping of the WaroTrans software product across management and robot-edge repositories. |
| 2 | UserApplications | Logical grouping of end-user client applications that interact with the backend Host over REST and SignalR. |
| 3 | Backend | Logical grouping of the ASP.NET Core modular monolith that provides APIs, domain modules, and fleet traffic coordination services. |
| 4 | RobotEdge | Logical grouping of ROS 2 packages that perform on-robot sensing, localization, navigation, MQTT bridging, and simulation. |
| 5 | web | Admin console single-page application for warehouse map management, fleet oversight, jobs, and operational configuration. |
| 6 | app | Staff-facing mobile application for day-to-day warehouse operations and job/transport workflows. |
| 7 | WaroTrans.Host | Composition root that registers modules, exposes HTTP endpoints and SignalR hubs, and hosts cross-cutting middleware. |
| 8 | WaroTrans.BuildingBlocks | Shared kernel providing MQTT contracts, authentication helpers, persistence utilities, results, and integration-event infrastructure. |
| 9 | WaroTrans.Identity | Manages authentication, accounts, roles, and security concerns for system users. |
| 10 | WaroTrans.Warehouse | Manages warehouse master data and exposes warehouse contracts consumed by other modules. |
| 11 | WaroTrans.Transportation | Manages transport requests and orchestrates transportation-related business entry points. |
| 12 | WaroTrans.WorkflowExecution | Executes jobs and workflow runtimes, coordinating with fleet and navigation capabilities. |
| 13 | WaroTrans.Fleet | Registers robots, ingests MQTT robot traffic, and runs server-side traffic authority/reservation coordination. |
| 14 | WaroTrans.Navigation | Manages warehouse maps, compiles route/traffic graphs and policies, and exports navigation artifacts. |
| 15 | WaroTrans.Operations | Manages operational notifications, issue reporting, and audit-oriented documents using MongoDB. |
| 16 | warotrans_msgs | Defines WaroTrans-specific ROS message interfaces shared by hardware and teleop packages. |
| 17 | warotrans_description | Provides robot URDF/description assets used by bringup and simulation. |
| 18 | warotrans_hardware | Bridges MCU serial I/O and publishes wheel odometry for the mobile base. |
| 19 | warotrans_sensors | Hosts on-robot sensor nodes and related sensor bringup support. |
| 20 | warotrans_localization | Supplies localization launch files and configuration for map-based pose estimation. |
| 21 | warotrans_slam | Supplies SLAM launch files and configuration for mapping workflows. |
| 22 | warotrans_navigation | Configures and launches the Nav2 navigation stack for the robot. |
| 23 | warotrans_lane_planner | Provides the LaneAwareNavfn global planner plugin for Nav2. |
| 24 | warotrans_fleet | Provides the MQTT robot gateway, motion authority gate, and path policy validation nodes. |
| 25 | warotrans_teleop | Provides commissioning teleoperation for the mobile base. |
| 26 | warotrans_perception | Placeholder package reserved for future perception capabilities. |
| 27 | warotrans_bringup | Orchestrates robot-side launch compositions for hardware, sensors, localization, and navigation. |
| 28 | warotrans_simulation | Provides Gazebo-based simulation worlds, launches, and semantic map adapter tooling. |

---

## 2. User Applications

| No. | Package | Description |
|---|---|---|
| 1 | UserApplications | Logical container for admin and staff client applications. |
| 2 | web | Admin Vite/React SPA used for console operations (ADMIN-gated). |
| 3 | web.app | Application shell, layout, and chrome composition for the admin SPA. |
| 4 | web.features | Feature modules implementing admin screens (maps, robots, jobs, workflows, accounts, etc.). |
| 5 | web.shared | Shared API client, UI primitives, map visualization, realtime hub client, and helpers. |
| 6 | app | Staff Expo/React Native mobile application. |
| 7 | app.app | Mobile navigation, providers, and shell composition. |
| 8 | app.features | Feature modules for staff workflows (auth, home, inventory, jobs, monitoring, safety, transport). |
| 9 | app.shared | Shared mobile API client, theme, UI primitives, realtime client, and utilities. |

---

## 3. Backend

| No. | Package | Description |
|---|---|---|
| 1 | Backend | Logical container for the modular monolith projects. |
| 2 | WaroTrans.Host | HTTP/SignalR host and dependency-injection composition root. |
| 3 | WaroTrans.BuildingBlocks | Cross-module shared infrastructure and MQTT/integration contracts. |
| 4 | WaroTrans.Identity | User identity and authorization module. |
| 5 | WaroTrans.Warehouse | Warehouse domain module and contracts. |
| 6 | WaroTrans.Transportation | Transport request management module. |
| 7 | WaroTrans.WorkflowExecution | Job/workflow execution module. |
| 8 | WaroTrans.Fleet | Fleet registry, MQTT ingress, and runtime traffic coordination module. |
| 9 | WaroTrans.Navigation | Map management, RouteGraph compile, and traffic policy compile module. |
| 10 | WaroTrans.Operations | Operations notifications and audit module (MongoDB). |

*Optional nested detail (if drawn):* `Navigation.RouteGraph`, `Navigation.Traffic`, `Fleet.Traffic`, `Fleet.Mqtt`, `BuildingBlocks.Mqtt` — folders/namespaces inside the listed projects, not separate `.csproj` packages.

---

## 4. Robot Edge

| No. | Package | Description |
|---|---|---|
| 1 | RobotEdge | Logical container for ROS 2 WaroTrans packages. |
| 2 | warotrans_msgs | Shared ROS interfaces for low-level motor/encoder messaging. |
| 3 | warotrans_description | Robot model description package. |
| 4 | warotrans_hardware | Hardware bridge and odometry package. |
| 5 | warotrans_sensors | Sensor node package. |
| 6 | warotrans_localization | Localization configuration/launch package. |
| 7 | warotrans_slam | Mapping/SLAM configuration/launch package. |
| 8 | warotrans_navigation | Nav2 navigation configuration/launch package. |
| 9 | warotrans_lane_planner | Lane-aware global planner plugin package. |
| 10 | warotrans_fleet | Fleet MQTT gateway and on-robot traffic safety nodes. |
| 11 | warotrans_teleop | Teleoperation package for commissioning. |
| 12 | warotrans_perception | Scaffold perception package (not yet implementing nodes). |
| 13 | warotrans_bringup | Robot bringup orchestration package. |
| 14 | warotrans_simulation | Simulation-only Gazebo and semantic tooling package. |

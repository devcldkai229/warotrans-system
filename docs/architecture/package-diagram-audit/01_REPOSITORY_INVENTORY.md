# 01 — Repository Inventory

**Audit date:** 2026-11-03  
Excluded from trees: `node_modules`, `bin`, `obj`, `build`, `install`, `log`, `dist`, `.git`, `__pycache__`, venvs.

---

## Repository A — `warotrans-system`

**Root:** `E:/programming/my_project/warotrans-system`

```text
warotrans-system/
├── app/                    # Expo staff mobile (warotrans-app)
├── web/                    # Vite admin SPA (warotrans-web)
├── backend/
│   ├── WaroTrans.slnx      # Solution (XML; no classic .sln)
│   ├── src/
│   │   ├── WaroTrans.BuildingBlocks/
│   │   ├── WaroTrans.Host/
│   │   └── Modules/
│   │       ├── Identity/
│   │       ├── Warehouse/
│   │       ├── Transportation/
│   │       ├── WorkflowExecution/
│   │       ├── Fleet/
│   │       ├── Navigation/
│   │       └── Operations/
│   ├── tests/
│   │   ├── WaroTrans.UnitTests/
│   │   ├── WaroTrans.ArchitectureTests/
│   │   └── WaroTrans.IntegrationTests/
│   └── tools/
│       └── JobProvisionDemo/   # csproj exists; NOT listed in WaroTrans.slnx
├── docs/
├── rules/
├── infrastructure/
├── samples/
└── tools/
```

### Applications / projects (VERIFIED)

| Kind | Name | Path |
|---|---|---|
| Admin web SPA | `warotrans-web` | `web/` |
| Staff mobile | `warotrans-app` | `app/` |
| API host | `WaroTrans.Host` | `backend/src/WaroTrans.Host/` |
| Shared kernel | `WaroTrans.BuildingBlocks` | `backend/src/WaroTrans.BuildingBlocks/` |
| Module | `WaroTrans.Identity` | `backend/src/Modules/Identity/` |
| Module | `WaroTrans.Warehouse` | `backend/src/Modules/Warehouse/` |
| Module | `WaroTrans.Transportation` | `backend/src/Modules/Transportation/` |
| Module | `WaroTrans.WorkflowExecution` | `backend/src/Modules/WorkflowExecution/` |
| Module | `WaroTrans.Fleet` | `backend/src/Modules/Fleet/` |
| Module | `WaroTrans.Navigation` | `backend/src/Modules/Navigation/` |
| Module | `WaroTrans.Operations` | `backend/src/Modules/Operations/` |
| Tests | Unit / Architecture / Integration | `backend/tests/*` |
| Tool (orphan vs slnx) | `JobProvisionDemo` | `backend/tools/JobProvisionDemo/` |

### Relevant configuration

- Host: `backend/src/WaroTrans.Host/appsettings*.json`, `Properties/launchSettings.json`
- Web: `web/vite.config.ts`, `web/package.json`
- App: `app/app.json`, `app/package.json`
- Project rules: `rules/` (architectural constraints; not runtime packages)

---

## Repository B — `warotrans`

**Root:** `E:/programming/my_project/warotrans`

```text
warotrans/
├── ros2_ws/
│   └── src/
│       ├── warotrans_msgs/
│       ├── warotrans_description/
│       ├── warotrans_hardware/
│       ├── warotrans_sensors/
│       ├── warotrans_localization/
│       ├── warotrans_slam/
│       ├── warotrans_navigation/
│       ├── warotrans_lane_planner/
│       ├── warotrans_fleet/
│       ├── warotrans_teleop/
│       ├── warotrans_perception/
│       ├── warotrans_bringup/
│       └── warotrans_simulation/
├── firmware/
│   ├── warotrans_low_level/
│   └── encoder_test/
├── docs/
├── demo/
└── tools/
```

### ROS packages (VERIFIED — 13)

All under `ros2_ws/src/<name>/` with `package.xml`.

### Non-ROS software

| Path | Kind |
|---|---|
| `firmware/warotrans_low_level/` | Arduino sketch (ESP32 low-level) |
| `firmware/encoder_test/` | Arduino test sketch |

---

## Cross-repository runtime links (not compile deps)

| From | To | Mechanism |
|---|---|---|
| `web`, `app` | `WaroTrans.Host` | HTTPS REST `/api/*`, SignalR `/hubs/notifications` |
| `WaroTrans.BuildingBlocks` + `Fleet` | Robot `warotrans_fleet` | MQTT topics/commands/authority |
| `Navigation` map assets / GeoJSON export | Robot Nav2 / sim | HTTP/files (config & ops dependent) |

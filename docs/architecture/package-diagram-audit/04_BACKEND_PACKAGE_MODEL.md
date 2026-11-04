# 04 — Backend Package Model

**Audit date:** 2026-11-03  
**Solution:** `backend/WaroTrans.slnx` (no classic `.sln`)  
**TFM:** `net10.0`

---

## Production projects (VERIFIED)

| Project / package | Path | ProjectReferences |
|---|---|---|
| `WaroTrans.Host` | `backend/src/WaroTrans.Host/` | BuildingBlocks + all 7 modules |
| `WaroTrans.BuildingBlocks` | `backend/src/WaroTrans.BuildingBlocks/` | *(none)* |
| `WaroTrans.Identity` | `backend/src/Modules/Identity/` | BuildingBlocks |
| `WaroTrans.Warehouse` | `backend/src/Modules/Warehouse/` | BuildingBlocks |
| `WaroTrans.Transportation` | `backend/src/Modules/Transportation/` | BuildingBlocks, WorkflowExecution, Warehouse, Navigation |
| `WaroTrans.WorkflowExecution` | `backend/src/Modules/WorkflowExecution/` | BuildingBlocks, Fleet, Navigation |
| `WaroTrans.Fleet` | `backend/src/Modules/Fleet/` | BuildingBlocks, Warehouse, Navigation |
| `WaroTrans.Navigation` | `backend/src/Modules/Navigation/` | BuildingBlocks, Warehouse |
| `WaroTrans.Operations` | `backend/src/Modules/Operations/` | BuildingBlocks |

**RootNamespace:** not explicitly set in csproj; code namespaces follow `WaroTrans.<Module>...`.

---

## Composition root

**File:** `backend/src/WaroTrans.Host/Program.cs`

Registration order:

```text
AddBuildingBlocks → AddIdentityModule → AddWarehouseModule → AddTransportationModule
→ AddWorkflowExecutionModule → AddFleetModule → AddNavigationModule → AddOperationsModule
```

Endpoint mapping: `MapXxxEndpoints` for each module (`/api/identity`, `/api/warehouse`, `/api/transportation`, `/api/workflow-execution`, `/api/fleet`, `/api/navigation`, `/api/operations`).

Host also wires JWT, CORS, SignalR, health checks (Npgsql + Mongo), map static assets.

---

## Internal structure pattern (VERIFIED)

Modules use **vertical slices**, not Clean Architecture layer folders:

Typical folders: `Features/`, `Entities/`, `Persistence/`, often `Contracts/`, plus module-specific areas (`Traffic/`, `Mqtt/`, `Execution/`, `RouteGraph/`, …).

Architecture tests enforce Contracts-facing cross-module usage (`WaroTrans.ArchitectureTests`).

---

## Module package sketches

### Identity

```text
WaroTrans.Identity
├── Entities, Enums, Features, Persistence, Security
```

- Db: `IdentityDbContext` (EF/Npgsql)
- No ProjectReference to other business modules

### Warehouse

```text
WaroTrans.Warehouse
├── Contracts, Entities, Enums, Features, Persistence, Services
```

- Contracts include `IWarehouseModule`, `IMapEndpointCatalog` (implemented by Navigation)
- Db: `WarehouseDbContext`

### Transportation

```text
WaroTrans.Transportation
├── Entities, Enums, Features, IntegrationEventHandlers, IntegrationEvents, Persistence, Services
```

- Uses Warehouse / Navigation / WorkflowExecution **Contracts**
- Db: `TransportationDbContext`

### WorkflowExecution

```text
WaroTrans.WorkflowExecution
├── Contracts, Entities, Enums, Execution, Features, IntegrationEventHandlers,
│   Persistence, Planning, Registry, Runtime, Services, Validation, ValueObjects
```

- `JobExecutionEngine` uses Fleet + Navigation
- Db: `WorkflowExecutionDbContext`

### Fleet

```text
WaroTrans.Fleet
├── Abstractionsions/Abstractionsions, Contracts, Entities, Enums, Features,
│   IntegrationEvents, Mqtt, Persistence, Services, Traffic (+ StationPolicies)
```

- Runtime traffic coordination (`TrafficCoordinator`, `SegmentedTrafficCoordinator`, Semantic reservation/authority)
- MQTT ingress: `Mqtt/RobotMqttIngress.cs` implements BuildingBlocks `IRobotMqttIngress`
- Db: `FleetDbContext`

### Navigation

```text
WaroTrans.Navigation
├── Contracts, Entities, Enums, Features, Geometry, Persistence,
│   RouteGraph, Services, Traffic
```

- Map CRUD, traffic graph **compile**/validation, RouteGraph builder/export
- Implements Warehouse `IMapEndpointCatalog`
- Does **not** run robot Nav2 planning
- Db: `NavigationDbContext`

### Operations

```text
WaroTrans.Operations
├── Contracts, Documents, Enums, Features, Persistence, Services
```

- MongoDB via `OperationsMongoContext` (notifications, issue reports, audit logs)
- No ProjectReference to other business modules

### BuildingBlocks

```text
WaroTrans.BuildingBlocks
├── Abstractionsions, Authorization, Enums, Exceptions, IntegrationEvents,
│   Mqtt, Options, Persistence, Results, Statistics
```

- Shared MQTT contracts/topics/publisher/subscriber hosted services
- `CodeSequenceDbContext`, JWT/options helpers, integration event publisher
- Must not depend on modules (architecture test)

---

## Traffic architecture split (critical for SDD)

| Concern | Package | Role |
|---|---|---|
| Map entities, zones, lanes, endpoints | Navigation | Persistence + Features |
| RouteGraph topology compile | Navigation.RouteGraph | Active substrate |
| Traffic graph compile/validate/cache | Navigation.Traffic | Policy/compile |
| Runtime reservation / authority / grant modes | Fleet.Traffic | Coordinator + hosted services |
| MQTT topics & message DTOs | BuildingBlocks.Mqtt | Shared contracts |
| MQTT robot ingress adapter | Fleet.Mqtt | Implements ingress |
| Robot local planning | RobotEdge `warotrans_navigation` / `warotrans_lane_planner` | Not backend |

**RouteGraph status:** ACTIVE for compile/export; Semantic traffic mode avoids RouteGraph A\* for live grants — do **not** label RouteGraph as retired.

---

## Verified ProjectReference dependency graph

```text
Host ──► BuildingBlocks, Identity, Warehouse, Transportation,
         WorkflowExecution, Fleet, Navigation, Operations

Transportation ──► BuildingBlocks, WorkflowExecution, Warehouse, Navigation
WorkflowExecution ──► BuildingBlocks, Fleet, Navigation
Fleet ──► BuildingBlocks, Warehouse, Navigation
Navigation ──► BuildingBlocks, Warehouse
Identity ──► BuildingBlocks
Warehouse ──► BuildingBlocks
Operations ──► BuildingBlocks
```

Arrow direction: **dependent → required** (UML package dependency).

---

## Persistence summary

| Store | Used by |
|---|---|
| PostgreSQL / EF Core | BuildingBlocks code sequences; Identity; Warehouse; Transportation; WorkflowExecution; Fleet; Navigation |
| MongoDB | Operations only |

External DBs are **not** UML packages.

---

## Tests / tools (optional on diagrams)

| Project | Refs |
|---|---|
| UnitTests | BuildingBlocks, Warehouse, Fleet, WorkflowExecution, Navigation, Transportation |
| ArchitectureTests | BuildingBlocks + all 7 modules |
| IntegrationTests | Host |
| JobProvisionDemo | WorkflowExecution, BuildingBlocks (not in slnx) |

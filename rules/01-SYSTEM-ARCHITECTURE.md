# 01 — System Architecture

## Repository
```text
warotrans-sys/
├── backend/
├── web/
├── app/
├── infrastructure/
├── rules/
├── .cursor/
└── .github/
```

## Backend solution
```text
backend/
├── WaroTrans.sln
├── src/
│   ├── WaroTrans.Host/
│   ├── WaroTrans.BuildingBlocks/
│   └── Modules/
│       ├── Identity/
│       ├── Warehouse/
│       ├── Transportation/
│       ├── WorkflowExecution/
│       ├── Fleet/
│       ├── Navigation/
│       └── Operations/
└── tests/
    ├── WaroTrans.UnitTests/
    ├── WaroTrans.IntegrationTests/
    └── WaroTrans.ArchitectureTests/
```

`WaroTrans.Host` is the only executable backend project.

## Backend style
```text
ASP.NET Core
+ Modular Monolith
+ Vertical Slice Architecture
+ Minimal APIs
```

Typical module:
```text
Module/
├── Domain/
├── Features/
├── Contracts/
├── Persistence/
└── <ModuleName>Module.cs
```

Do not create global `Controllers/`, generic business `Services/`, or generic repository layers.

## Persistence ownership
| Module | Persistence |
|---|---|
| Identity | PostgreSQL schema `identity` |
| Warehouse | PostgreSQL schema `warehouse` |
| Transportation | PostgreSQL schema `transportation` |
| WorkflowExecution | PostgreSQL schema `execution` |
| Fleet | PostgreSQL schema `fleet` |
| Navigation | PostgreSQL schema `navigation` |
| Operations | MongoDB `warotrans_operations` |

V1 uses one physical PostgreSQL database `warotrans`.

## Host responsibilities
- register all modules;
- map module Minimal APIs;
- authentication/authorization;
- global exception handling;
- OpenAPI;
- health checks;
- SignalR;
- configuration;
- Development-only migration startup.

Host must not contain business use-case logic.

## Communication
```text
Web/App → Backend: REST
Backend → Web/App: SignalR
Module → Module immediate result: public in-process Contract
Module → Module business fact: in-process Integration Event
Backend ↔ Robot boundary: MQTT
```

Do not use HTTP/gRPC between modules in the same process.

## BuildingBlocks
Allowed: `Result`, `Error`, integration-event abstractions, `IEventBus`, `ICurrentUser`, technical web/error primitives.

Do not put Warehouse/Fleet/Workflow business services in BuildingBlocks.

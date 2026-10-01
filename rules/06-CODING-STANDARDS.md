# 06 — Coding Standards

Goal: one consistent codebase even when multiple members use Cursor/AI.

## Core principles
1. Prefer simple explicit code.
2. Follow existing patterns before creating new ones.
3. Do not create abstractions without a demonstrated need.
4. Do not add domain concepts merely to simplify implementation.
5. Keep module boundaries strict.
6. Make the smallest coherent change for the requested use case.
7. Code must build before it is considered complete.
8. Add/update tests when behavior changes.

## C# backend
- Nullable enabled.
- Use async for I/O.
- Async methods end with `Async`.
- Pass `CancellationToken` through DB/network operations.
- Persist timestamps as `DateTimeOffset` in UTC.
- Prefer immutable request/response records where practical.
- Use DI; no service locator.
- Do not swallow exceptions.
- Never log passwords, tokens, or connection strings.

## Naming
C#:
```text
TransportRequest
CreateTransportRequest
HandleAsync
IWarehouseModule
TransportRequestQueued
```

Database:
```text
transport_requests
workflow_steps
created_at
transport_request_id
```

C# = PascalCase.
PostgreSQL identifiers = snake_case.

## Enums
- Enums model controlled states/types.
- Persist finalized PostgreSQL enums as readable strings unless explicitly decided otherwise.
- Do not create lookup tables for code-only enums.
- Do not invent enum values inside a feature.

## Domain behavior
State transitions belong in Domain/application behavior, not UI mapping.
Avoid arbitrary public setters for stateful aggregates.
Domain must not depend on HTTP/UI concerns.

## Persistence
Use EF Core directly from the appropriate Vertical Slice Handler when clear/testable.

Do not create:
```text
GenericRepository<T>
GenericService<T>
BaseCrudService<T>
```

Use `IEntityTypeConfiguration<T>` under `Persistence/Configurations`.

Cross-module reference:
- scalar UUID;
- no cross-module EF navigation;
- no cross-module DbContext usage.

## Validation
FluentValidation:
- required fields;
- lengths;
- ranges;
- list/shape validation.

Handler/Domain:
- DB-dependent business checks;
- module Contract checks;
- transitions;
- business authorization.

Do not put DB queries in validators by default.

## Errors
Use consistent `Result/Error` for expected business failures.
Unexpected exceptions go to global exception handling.
Do not expose stack traces to clients.

## Logging
Use structured logging and correlation IDs for important flows.

```csharp
logger.LogInformation(
    "TransportRequest {RequestId} queued by {AccountId}",
    request.Id,
    currentUser.Id);
```

## Comments
Comments explain why/invariants/non-obvious constraints.
Do not comment obvious syntax.
Project-wide constraints belong in `/rules`.

## Vibe coding discipline
Before asking Cursor/AI to code:
1. reference relevant `/rules`;
2. state exact feature scope;
3. state owning module;
4. state what must not change;
5. ask it to inspect existing patterns first;
6. ask it to build/test after changes.

AI must not:
- invent entities/tables/statuses;
- casually rename finalized domain terms;
- add libraries/patterns without approval;
- bypass module Contracts;
- create giant shared helpers;
- silently modify unrelated migrations.

The developer who commits AI-generated code owns its correctness.

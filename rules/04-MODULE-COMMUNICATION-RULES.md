# 04 — Module Communication Rules

## Ownership
Every module owns:
- Domain
- Features
- Persistence
- DbContext/collections
- public Contracts

A module must not directly access another module's:
- DbContext
- EF configuration
- internal entity
- repository
- feature handler
- database table/collection

## Immediate result needed
Use an in-process public Contract.

Example:
```csharp
public interface IWarehouseModule
{
    Task<ContainerSnapshot?> GetContainerAsync(
        Guid containerId,
        CancellationToken cancellationToken);
}
```

Correct:
```text
Transportation → IWarehouseModule → ContainerSnapshot
```

Incorrect:
```text
Transportation → WarehouseDbContext
```

Contracts return DTO/snapshot types, never another module's domain entity.

## Business fact happened
Publish an in-process integration event.

Examples:
```text
TransportRequestQueued
JobQueued
RobotAssigned
JobCompleted
RobotOffline
HandoverConfirmed
```

Example:
```text
Transportation commits request
→ publish TransportRequestQueued
→ WorkflowExecution handles it
→ create Job
```

Do not use request/reply events for normal queries when a Contract is simpler.

## Same-process rule
Do not call another module through:
- HTTP
- gRPC
- MQTT

Modules are in the same ASP.NET Core process.

## Transactions
A module owns its transaction boundary.
Do not start one EF transaction spanning multiple module DbContexts.

## Event reliability
V1:
```text
in-process event bus
```

Later:
```text
transaction + Outbox + reliable dispatch
```

Do not introduce Kafka/RabbitMQ without a concrete requirement and approval.

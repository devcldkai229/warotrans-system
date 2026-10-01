# 00 — Project Context

## Product
WaroTrans is a smart warehouse internal transportation and dispatching system.

It coordinates Staff/Admin, Containers, TransportRequests, Workflows, Jobs, Robots, maps, and operational monitoring.

## V1 physical model
The Robot transports a **Container**, not individual Product quantities.

```text
Supplier package barcode
→ identify Product
→ create WaroTrans Container
→ generate internal Container barcode
→ create TransportRequest
→ create/execute Job
→ Robot transports Container
→ Staff confirms pickup/dropoff
→ update Container location + InventoryStock
```

### Container
- Physical transport unit.
- V1: one Container is associated with one Product type.
- Handover confirms Container identity.
- Robot workflow does not manipulate product quantity.

### InventoryStock
`InventoryStock.ContainerCount` is the number of Containers for a Product at a StorageLocation/level, not product-unit quantity.

### StorageLocation
A simple logical storage location such as `Shelf A`.
Do not add Aisle/Bay/Bin entities unless explicitly approved.
A StorageLocation stores the UUID of its semantic Navigation Endpoint.

## Applications
```text
React + TypeScript + Vite Web
React Native + TypeScript App
            │
        REST/SignalR
            │
      WaroTrans.Host
            │
      Modular Monolith
            │
 PostgreSQL / MongoDB / MQTT
```

Robot ROS2/firmware source code lives outside `warotrans-sys`.

## Core workflows
1. INBOUND_PUTAWAY
2. OUTBOUND_RETRIEVAL
3. INTERNAL_RELOCATION
4. POINT_TO_POINT_TRANSPORT
5. PAYLOAD_RECOVERY
7. MAINTENANCE_ALL_ROBOTS

## Optional workflows
1. QUALITY_INSPECTION_TRANSFER
2. ROBOT_RETURN_TO_PARK
3. ROBOT_CHARGING
4. EMPTY_CONTAINER_RETURN
5. ROBOT_PREPOSITIONING

All workflows reuse the supported Step Types.

## Hard prohibitions
Do not create persisted entities/tables named:
- `TransportMovement`
- `BindingSource`
- `TrafficResource`
- `TrafficReservation`

Do not introduce new entities, states, modules, tables, or architecture patterns without explicit approval.
Do not convert code-only enums into lookup tables unless explicitly approved.

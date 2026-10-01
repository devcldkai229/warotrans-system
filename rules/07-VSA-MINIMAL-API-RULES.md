# 07 — VSA + Minimal API Rules

## Feature structure
A use case is a Vertical Slice.

```text
Transportation/
└── Features/
    └── CreateTransportRequest/
        ├── Endpoint.cs
        ├── Request.cs
        ├── Response.cs
        ├── Validator.cs
        └── Handler.cs
```

Organize by use case, not by global technical layer.

## Endpoint
Responsible for:
- route;
- authorization requirement;
- request binding;
- invoking Handler;
- mapping Result to HTTP.

No core business logic in Endpoint.

## Request / Response
Feature-local types.
Never return EF/domain entities directly from API.

## Validator
Input shape/simple constraints only.

## Handler
Typical flow:
```text
validate required external state
→ query owning DbContext
→ call public module Contracts if needed
→ execute domain behavior
→ SaveChanges
→ publish post-commit event when appropriate
→ return Result/Response
```

Keep Handler use-case specific.

## Domain
Contains:
- entities/aggregates;
- value objects where justified;
- transitions/invariants;
- finalized enums.

Domain does not depend on Minimal API, React, or EF configuration.

## Module registration
Each module exposes:
```text
Add<ModuleName>Module(...)
Map<ModuleName>Module(...)
```

A module must not register another business module.
Host composes all modules.

## Do not introduce by default
- global MVC Controllers;
- generic repositories;
- generic service layer;
- MediatR only for indirection;
- AutoMapper for trivial mapping;
- module-to-module HTTP/gRPC;
- event request/reply for normal queries.

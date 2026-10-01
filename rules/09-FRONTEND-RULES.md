# 09 — Frontend Rules

## Web
```text
React + TypeScript + Vite
```

## Mobile
```text
React Native + TypeScript
```

## Structure
Feature-oriented:
```text
src/
├── app/
├── shared/
└── features/
    ├── auth/
    ├── receiving/
    ├── containers/
    ├── transport-requests/
    ├── workflows/
    ├── jobs/
    ├── robots/
    ├── maps/
    └── issues/
```

Mobile includes only appropriate Staff/mobile features.

## TypeScript
Use strict TypeScript.
Avoid `any` unless unavoidable and documented.
Centralize/generate API contract types; do not duplicate them across features.

## Server state
Prefer TanStack Query for server state.
Do not copy remote data into global client state without reason.

## Forms
Recommended:
```text
React Hook Form + Zod
```

TransportRequest UI must render `STAFF_INPUT` Workflow variables dynamically from backend schema/metadata.
Do not hard-code definition-driven fields.

## Workflow Builder
Admin UI must support:
- `+ Variable`;
- ADMIN_INPUT / STAFF_INPUT / SYSTEM_VALUE metadata;
- Task/Step definition;
- backend-supported StepType selection;
- input bindings;
- Workflow variable → Step input;
- previous Step output → later Step input;
- CURRENT_MOVEMENT bindings;
- constants.

Admin cannot invent executable Step Types unsupported by backend.

## Realtime
SignalR for:
- Robot status/pose;
- Job/Step progress;
- Request progress;
- handover required;
- notifications/issues.

REST remains primary command/query API.

## Domain authority
Frontend must not invent:
- backend states;
- state transitions;
- permissions;
- runtime rules.

Backend is authoritative.

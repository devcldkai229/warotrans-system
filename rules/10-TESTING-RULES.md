# 10 — Testing Rules

## Unit tests
Test pure/domain behavior:
- state transitions;
- binding resolver utilities;
- scoring/calculation logic;
- value/invariant rules.

No PostgreSQL/MongoDB dependency.

## Integration tests
Use real disposable infrastructure where useful:

```text
Minimal API / Handler
→ EF Core / Mongo
→ PostgreSQL / MongoDB test instance
```

Important coverage:
- create/query/cancel TransportRequest;
- migrations;
- Workflow → Job creation;
- movement expansion;
- Step binding resolution;
- Job state transitions;
- JobAssignment constraints;
- Operations persistence;
- auth/RBAC when implemented.

## Architecture tests
Protect module boundaries.

Examples:
```text
Transportation must not reference Warehouse.Persistence
Fleet must not reference WorkflowExecution.Persistence
Modules must not reference WaroTrans.Host
Domain must not depend on ASP.NET endpoint types
```

Only approved public Contracts may cross module boundaries.

## E2E/system integration
Eventually cover all 7 core workflows.

Robot physical/ROS2 tests happen in the robot repository/environment.
`warotrans-sys` should expose mockable/simulatable MQTT boundaries for backend integration.

## Regression
A defect fix should add a regression test when practical.

## CI
Feature/PR CI:
- restore/install;
- build;
- unit tests;
- architecture tests;
- frontend lint/typecheck/build.

Develop CI additionally:
- PostgreSQL + MongoDB services;
- migrations on clean DB;
- integration tests;
- full build.

Tests must not depend on a developer's local database.

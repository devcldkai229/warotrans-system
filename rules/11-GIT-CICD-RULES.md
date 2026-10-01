# 11 — Git & CI/CD Rules

## Branch model
Only:
```text
main
develop
feature/*
```

Examples:
```text
feature/workflow-engine
feature/container-receiving
feature/navigation-zones
```

## Branch rules
No direct push to `main`.
No direct push to `develop`.

Normal flow:
```text
develop
  ↓ create
feature/*
  ↓ commits
PR feature/* → develop
  ↓ CI + review
develop
```

Stable milestone:
```text
develop → PR → main
```

## Feature branch CI
Fast feedback:
```text
backend:
- dotnet restore
- dotnet build
- unit tests

web:
- npm ci
- lint
- typecheck
- build

app:
- npm ci
- lint
- typecheck
```

## PR → develop
Required:
```text
backend build
unit tests
architecture tests
web lint/typecheck/build
app lint/typecheck
```

If DB/migrations changed:
- apply migrations to a clean test DB;
- fail PR if migration/application fails.

## Develop CI
Full integration pipeline:
```text
start PostgreSQL + MongoDB
→ restore/build
→ apply migrations to clean DB
→ unit tests
→ architecture tests
→ integration tests
→ Web lint/typecheck/build
→ App lint/typecheck
→ docker compose config validation
```

`develop` is the shared integration branch.

## develop → main
Run full CI again.
`main` = stable demo/release baseline.

Early-stage optional artifacts:
- backend Docker image;
- web Docker image;
- tag with commit SHA.

## CD
Do not overbuild CD at the beginning.
First protect build, migrations, tests, module boundaries, and frontend compilation.

Later:
```text
develop → staging
main → controlled demo/release deployment
```

Do not add Kubernetes/cloud complexity without a real deployment requirement.

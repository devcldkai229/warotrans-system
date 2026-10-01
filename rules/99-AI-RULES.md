# 99 — AI Rules

## Mandatory preflight

Before modifying WaroTrans code:

1. Read `/rules/00-PROJECT-CONTEXT.md`.
2. Read `/rules/01-SYSTEM-ARCHITECTURE.md`.
3. Read `/rules/02-DOMAIN-RULES.md`.
4. Read `/rules/03-WORKFLOW-RUNTIME-RULES.md`.
5. Read `/rules/04-MODULE-COMMUNICATION-RULES.md`.
6. Read `/rules/05-NAVIGATION-RULES.md`.
7. Read `/rules/06-CODING-STANDARDS.md`.
8. Read feature-specific rule files.
9. Inspect existing code patterns.

## Never do automatically
Never introduce a new:
- domain entity;
- DB table/collection;
- domain status;
- Step Type;
- module dependency;
- architecture pattern;
- infrastructure technology;

unless explicitly approved.

Never create:
```text
TransportMovement
BindingSource
TrafficResource
TrafficReservation
```

Never bypass module boundaries via another module's DbContext/table.
Never silently replace finalized terminology with a different model.

## Conflicts
If current code, prompt, older document, and `/rules` disagree:
- stop changing domain behavior;
- describe the conflict;
- identify affected files;
- ask for confirmation if the correct decision is not explicit.

Do not silently guess.

## Implementation workflow
1. identify owning module;
2. inspect relevant entities/contracts;
3. read relevant rule files;
4. state minimal files to change;
5. implement requested scope only;
6. preserve module boundaries;
7. add/update tests;
8. run formatter/build/tests;
9. report changes and unresolved issues.

## Database changes
Do not generate/remove migrations casually.

If an entity change implies schema change:
- state it explicitly;
- generate only the owning module migration;
- validate on a clean DB;
- never alter another module's migration history.

## Refactoring
Do not perform broad unrelated refactors.
Do not rename public API/domain concepts without approval.
Prefer small reviewable diffs.

## Completion
Do not claim completion unless:
- code builds;
- relevant tests pass;
- migration validation passes when applicable;
- frontend typecheck/build passes when applicable;
- no hidden `/rules` conflict remains.

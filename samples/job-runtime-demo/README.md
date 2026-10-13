# Job Runtime Demo (ASSUMED TransportRequest → Provision)

**No TransportRequest API.** This demo uses an ASSUMED snapshot and provisions Job runtime entities
via `IWorkflowRequestValidator` + `IJobRuntimeProvisioner`.

## Labels

| Folder / file | Label |
|---|---|
| `api-responses/` | Real HTTP responses from WorkflowExecution APIs (create/publish/get/schema) |
| `assumed-fixtures/` | **ASSUMED / FIXTURE** — synthetic TransportRequest payload, snapshot, batch plan |
| `persisted-runtime/` | **PERSISTED REAL RUNTIME DATA** — Job / JobContainer / JobTask / JobStep from DB |

## Explicit non-claims

- `TransportRequestId` is **synthetic**. No Transportation DB row is created.
- `REQUEST_ACTIVE` is **not** executed end-to-end.
- `assignedRobotId`, JobAssignment, navigation, and HumanTask are **not** faked.
- After provision: `ResolvedInputs = {}`, `OutputValues = {}`, `TargetEndpointId = null`.

## Scenario

3 containers, shared pickup A, different dropoffs:

- C1: A → D
- C2: A → E
- C3: A → F

## Expected expansion

- Prechecks once (JOB scope)
- `CHECK_SOURCE_ENDPOINT` + `MOVE_PICKUP` once at stop A (STOP scope — no singular containerId)
- `PICKUP_CONFIRM` ×3 (CONTAINER_AT_STOP)
- Per dropoff stop: `CHECK_DEST_ENDPOINT` + `MOVE_DROPOFF` once, then `DROPOFF_CONFIRM` ×1

## Demo workflow naming

Use code prefix `DEMO_INTERNAL_RELOCATION_<timestamp>` so it is never mistaken for the
canonical Published `INTERNAL_RELOCATION v1` (WTCP-49).

## How to regenerate

```bash
# Seed a DEMO_INTERNAL_RELOCATION_<ts> Published workflow + provision (no Host/token needed):
dotnet run --project backend/tools/JobProvisionDemo -- --seed-demo

# Or provision against an existing Published workflow:
dotnet run --project backend/tools/JobProvisionDemo -- --workflow-id <guid>
```

Never store access tokens in this folder. Use env/config secrets for local scripts.

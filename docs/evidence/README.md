# Evidence: Transport Journey Recorder & Worker (operations)

Design: `WaroTrans_Evidence_Recorder_Worker_System_Design_V1.md`. Decision and deviations from the design: [ADR 0012](../adr/0012-evidence-recorder-worker.md).
Pi side: [pi-recording.md](pi-recording.md). AWS: [infrastructure/terraform/README.md](../../infrastructure/terraform/README.md).

```
Host :5090 ── EvidenceBridge outbox ──HTTP──▶ Recorder :5095 ◀── Web /api/evidence
Pi camera + evidence agent ── metadata ──────▶ Recorder
Pi ── presigned PUT ──▶ S3 raw/ ──▶ SQS segment-ingest ──▶ Worker :5096 (health only)
Worker ──▶ SQS media-process ──▶ MediaConvert ──▶ S3 playback/ ──▶ CloudFront ──▶ hls.js
MediaConvert ──▶ EventBridge ──▶ SQS media-result ──▶ Worker (HLS check, PlaybackSpans, READY)
```

The Recorder owns the `warotrans_evidence` database (schema `evidence`) and its migrations. The Worker uses the same database
but never references the Recorder. Transportation stays the source of truth: Evidence copies status strings and never
changes them.

## Run locally (no AWS)

The Local providers are the defaults:

| Provider | Local implementation |
|---|---|
| Storage | a folder, plus the Recorder's signed PUT |
| Queues | a Postgres table |
| Media | ffmpeg, dev only |
| Playback | HMAC-signed URLs served by the Recorder |

```bash
# 1. Host: turn the bridge on (user-secrets or env)
EvidenceBridge__Enabled=true
EvidenceBridge__RecorderBaseUrl=http://localhost:5095
EvidenceBridge__ServiceToken=<32+ random chars>

# 2. Recorder (Development migrates the database on start)
cd backend/src/WaroTrans.Evidence/Recorder
dotnet user-secrets set Evidence:ServiceToken "<the same token>"
dotnet user-secrets set Authentication:Jwt:Key "<the Host's JWT key>"
dotnet user-secrets set Evidence:Storage:LocalSigningKey "<32+ random chars>"
dotnet run --urls http://0.0.0.0:5095        # 0.0.0.0: the robots upload to it

# 3. Worker (needs ffmpeg on PATH; appsettings.Development.json selects Media:Provider=Local)
cd backend/src/WaroTrans.Evidence/Worker && dotnet run

# 4. Web: Vite proxies /api/evidence to VITE_EVIDENCE_API_URL (default http://localhost:5095)
cd web && npm run dev
```

The Recorder and the Worker must use the same `Evidence:Storage:LocalRoot` (default: a folder under the temp
directory). Set it explicitly when they run from different working directories.

With Docker, `docker compose --profile evidence up -d` in `infrastructure/` builds both services. It runs them with the Local
providers, a shared volume and `Evidence__MigrateOnStartup=true`. Put `Evidence__ServiceToken`,
`Authentication__Jwt__Key` and `Evidence__Storage__LocalSigningKey` in `infrastructure/.env`.

## Configuration

| Key | Service | Meaning |
|---|---|---|
| `ConnectionStrings:Evidence` | Recorder, Worker | `warotrans_evidence` on the same Postgres (use `127.0.0.1`, not `localhost`) |
| `Evidence:ServiceToken` / `EvidenceBridge:ServiceToken` | Recorder / Host | Shared secret of the bridge, header `X-Evidence-Service-Token`, ≥ 32 chars. The Recorder refuses to start without it |
| `Authentication:Jwt:Key` | Recorder | Same key as the Host (users sign in once) |
| `Evidence:CoreBaseUrl` | Recorder | Host URL: reconciliation and the technician robot scope (`/api/identity/me/capabilities`) |
| `Evidence:VideoRequired` | Recorder | `false` lets a journal reach FINALIZED without video |
| `Evidence:FinalizeGraceMinutes` | Recorder | How long a closed request waits for late segments before PARTIAL |
| `Evidence:RetentionDays` | Recorder | DB telemetry of closed journals kept this long (90; 0 = forever) |
| `Evidence:MigrateOnStartup` | Recorder | Apply migrations on start outside Development |
| `Evidence:Storage:*` | both | `Provider` `Local`/`S3`, `RawBucket`, `PlaybackBucket`, `Region`, `LocalRoot`, `LocalSigningKey`, `UploadGrantMinutes` |
| `Evidence:Queues:*` | both | `Provider` `Local`/`Sqs`, `Urls:segment-ingest`, `Urls:media-process`, `Urls:media-result` |
| `Evidence:Media:*` | Worker | `Provider` `None`/`Local`/`MediaConvert`, `MediaConvertQueueArn`, `MediaConvertRoleArn`, `FfmpegPath`, `StaleJobMinutes` |
| `Evidence:Playback:*` | Recorder | `Provider` `Local`/`CloudFront`, `GrantMode` `Query`/`Cookie`, `CloudFrontDomain`, `CloudFrontKeyPairId`, `PrivateKeyParameterName` (SSM), `CookieDomain` |

On AWS, `terraform output evidence_settings` prints every `Evidence__*` value except the secrets.

`GrantMode=Cookie` only works when CloudFront has a custom domain under the same parent domain as the UI. With
`*.cloudfront.net` or localhost, keep `Query`: the signed query string is added to every HLS request.

## Production reverse proxy

The web calls `/api/evidence/*` on its own origin. Route that prefix to the Recorder (`:5095`) **before** the
generic `/api` rule that goes to the Host. In a robot network, the robots reach the Recorder directly on `:5095`.

## Robot credentials

Each robot has its own token. Only its SHA-256 is stored. Issuing a new token revokes the old one.

```bash
curl -X POST -H "Authorization: Bearer <admin JWT>" \
  http://<recorder>:5095/api/evidence/admin/robots/RBT-002/credentials
# -> { "robotCode": "RBT-002", "token": "..." }   shown once; put it on the robot (pi-recording.md), nowhere else
```

The robot sends `Authorization: Robot RBT-002.<token>`. `GET /api/evidence/edge/whoami` checks it. A revoked token stops working within one minute (credential cache).

## Permissions

| Permission | Roles | Allows |
|---|---|---|
| `evidence.read` | ADMIN, TECHNICIAN | List and replay journals |
| `evidence.playback` | ADMIN, TECHNICIAN | Video playback grants |
| `evidence.annotate` | ADMIN, TECHNICIAN | Notes |
| `evidence.export` | ADMIN, TECHNICIAN | Export |
| `evidence.admin` | ADMIN | Access audit, robot credentials |

A technician only sees journals with a run on a robot in their scope. If the scope cannot be read, nothing is shown. Every read, grant and denial is written to `evidence.access_audits`.

## Queues and dead letters

Each queue has a DLQ (`warotrans-evidence-<queue>-dlq-<env>`). A message lands there after 5 failed receives, and the
CloudWatch alarm fires when a DLQ is not empty. Fix the cause (Worker log, correlated by segment, recording and
provider job id), then move the messages back:

```bash
aws sqs start-message-move-task \
  --source-arn arn:aws:sqs:ap-southeast-1:<account>:warotrans-evidence-segment-ingest-dlq-dev
```

Redelivery is safe: segment verification, job submission and result handling are all idempotent. A
`ClientRequestToken` and a claim by conditional update mean no MediaConvert job is made twice. The Worker's
reconciliation also repairs what a lost message left behind:

| Interval | What it repairs |
|---|---|
| Every 10 min | Segment intents compared with S3 |
| After `StaleJobMinutes` | Stale jobs, checked with `GetJob` |

With the Local queue provider, failed messages stay in `evidence.local_queue_messages` with their attempt count.

## Retention

| Data | Kept | Mechanism |
|---|---|---|
| Raw segments `raw/` | 90 days | S3 lifecycle (Terraform `raw_retention_days`) |
| HLS `playback/` | 30 days | S3 lifecycle (`playback_retention_days`); can be rebuilt from raw while raw exists |
| Trajectory, plans, events | `Evidence:RetentionDays` (90) after the journal closed | Recorder `EvidenceRetentionService`, every 6 h |
| Journal, runs, annotations, access audit | Not deleted | Who looked at what stays answerable |

A journal under an incident hold (`retention_hold_until_utc` in the future) keeps its database telemetry. Its S3 objects
need an S3 Object Lock or a lifecycle exception as well: the S3 lifecycle does not know about the hold.

## Health

| Endpoint | Checks |
|---|---|
| Recorder `GET /health` | Database |
| Worker `GET /health` on 5096 | Database |

The journal list shows evidence completeness (OPEN, FINALIZING, FINALIZED, PARTIAL). It is not the delivery result: the request's own status is shown next to it.

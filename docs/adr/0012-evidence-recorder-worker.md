# ADR 0012 — Transport Evidence: Recorder, Worker and EvidenceBridge

## Status

Accepted (2026-11-17). Phase 1 (foundation) is implemented. Phases 2–4 (edge recording, media pipeline, Technician
replay UI) follow the plan of `WaroTrans_Evidence_Recorder_Worker_System_Design_V1.md`.

## Context

Technicians must replay a whole Transport Request after an incident:
- each robot's camera;
- the path actually driven and the planned path;
- navigation, traffic and fault events, on one UTC timeline.

A request of 5 containers is carried by two robots (trips of at most 3). Several robots stream video segments
continuously. That load must not slow dispatch, traffic or the robots.

The owner approved the design document above, which asks for:
- two separately deployed .NET projects;
- an Evidence-owned database;
- S3 / SQS / MediaConvert / EventBridge / CloudFront;
- Terraform.

These go beyond `rules/01` ("`WaroTrans.Host` is the only executable") and `rules/99` (no new infrastructure technology
without approval). This ADR records that approval and the exact limits.

## Decision

1. **Evidence is its own bounded context, in its own processes.**
   - `backend/src/WaroTrans.Evidence/Recorder` is an ASP.NET Core API. It serves the Journal API and upload grants, and
     it is the only owner of the Evidence migrations.
   - `backend/src/WaroTrans.Evidence/Worker` handles queues, MediaConvert orchestration and reconciliation. It never
     migrates and never references the Recorder.
   - `backend/src/WaroTrans.Evidence/Shared` holds the entities, the `EvidenceDbContext` mapping, the wire contracts and
     the S3 key schema. Entities live here, not in the Recorder as the spec draws it, because the Worker must not
     reference an executable.
   - Organisation is Vertical Slice Architecture (VSA), not Clean Architecture.
2. **Its own database.**
   - The database is `warotrans_evidence`, schema `evidence`, on the same PostgreSQL server.
   - No foreign key and no `DbContext` is shared with the monolith.
   - External IDs (TransportRequest, Job, assignment, map, account) are plain references of the source's type (all
     `uuid`).
3. **Transport stays the source of truth.**
   - Evidence statuses describe how complete the *evidence* is (`OPEN/FINALIZING/FINALIZED/PARTIAL` …).
   - Transport, Job and assignment statuses are only copied verbatim into `*StatusSnapshot` columns, never mapped and
     never written back.
   - No entity, enum or status of an existing module was changed.
4. **Run key.**
   - One `RobotRunEvidence` corresponds to one row of `execution.job_robot_assignments`, with
     `RunCorrelationKey = "jra:{assignmentId}"`.
   - A trip handed to another robot, or retried by the same robot, gets a new run.
   - The key is never `requestId + robotId`.
5. **EvidenceBridge** is a new monolith module with schema `evidence_bridge`, holding one `outbox_messages` table.
   - The monolith had no outbox or broker; events were in-process only. The bridge adds:
     - handlers that turn the existing integration events into versioned envelopes in the outbox;
     - one new contract, `JobRobotAssignmentChanged`, published where assignment rows are written
       (`JobExecutionEngine.SaveWithAssignmentsAsync`);
     - `TrafficEvidenceTap`, which diffs the traffic snapshot every second (traffic code is unchanged);
     - `EvidenceOutboxRelay`, which delivers at least once, using `FOR UPDATE SKIP LOCKED` and exponential backoff,
       and never deletes undelivered rows;
     - a reconciliation read API, `GET /api/evidence-bridge/transport-requests/{id}/runs`, which requires the service
       token.
   - Capture never fails the business operation: errors are logged and swallowed.
   - Events of trips without a transport request (robot care) are skipped.
   - The bridge is off unless `EvidenceBridge:Enabled` is set.
6. **Authentication.**
   - Users: the Host's JWT is accepted unchanged. `AddWaroTransJwtAuthentication` moved to BuildingBlocks.
   - New permissions `evidence.read|playback|annotate|export` go to ADMIN and TECHNICIAN; `evidence.admin` goes to ADMIN.
   - A Technician sees only journals that involve a robot in their scope. The scope is read from Identity with the
     user's own token. If Identity cannot answer, nothing is shown (fail closed).
   - Robots use a per-robot credential: `Authorization: Robot <code>.<token>`, stored as SHA-256 and issued once by an
     admin.
   - Host to Recorder uses a shared service token.
7. **Infrastructure approved for Evidence only:**
   - AWS S3 (the existing bucket is imported, never recreated), SQS Standard with DLQs, Elemental MediaConvert,
     EventBridge, CloudFront with OAC and signed URLs/cookies, CloudWatch alarms;
   - Terraform in `infrastructure/terraform`;
   - `hls.js` in the web app.
   - `terraform apply` is run only with the owner's confirmation.
8. **Playback grant modes.**
   - Signed cookies need a CloudFront custom domain under the UI's parent domain.
   - On localhost or `*.cloudfront.net`, the Recorder grants a wildcard signed URL policy that hls.js appends to every
     request (`Playback:GrantMode = Cookie|Query`).

## Consequences

- There are three executables (Host, Recorder, Worker). Dev runs the Host on `:5090`, the Recorder on `:5095` and the
  Worker on `:5096` (health only). The web proxy sends `/api/evidence` to the Recorder.
- Remaining risks:
  - An event can still be lost if the Host crashes between `SaveChanges` and the in-process handler.
  - Recorder reconciliation (every 5 min) repairs assignments and runs. A transient event (one traffic wait, one
    command result) lost in that window stays lost.
- CI must migrate `EvidenceBridgeDbContext` and the Evidence database, and run `WaroTrans.Evidence.UnitTests` and
  `WaroTrans.Evidence.IntegrationTests`.
- Evidence observes only. A broken camera or upload never stops Nav2 or a trip, unless a future business policy
  explicitly makes video mandatory.

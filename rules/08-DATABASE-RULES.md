# 08 — Database Rules

## PostgreSQL
Database:
```text
warotrans
```

Schemas:
```text
identity
warehouse
transportation
execution
fleet
navigation
```

Each relational module owns one DbContext and its migrations.

## MongoDB
Database:
```text
warotrans_operations
```

Collections:
```text
issue_reports
notifications
audit_logs
```

Operations uses MongoDB only in V1.

## Ownership
Within one module: normal FK/navigation is allowed.

Across modules:
- UUID scalar only;
- no cross-module EF navigation;
- no cross-module DbContext query;
- no hard cross-module FK by default;
- validate through module Contracts/orchestration.

## IDs
UUID = technical PK.

Business codes are separate:
```text
WH-001
MAP-WH01-V001
RBT-001
CTN-YYYYMMDD-SEQ6
REQ-YYYYMMDD-SEQ6
JOB-YYYYMMDD-SEQ6
```

## JSONB
Use for intentionally dynamic data:
- TransportRequest.WorkflowInputs
- Workflow variable schema
- Workflow Step bindings
- Job/Task context
- JobStep resolved inputs/outputs
- Navigation geometry when finalized as JSON

Do **not** store the movement plan in TransportRequest JSONB; use `transport_request_details` rows.
JSON still requires application/schema validation.

## Index strategy
Index by query pattern, not every column.

Recommended baseline:
```text
Account.username UNIQUE
Account.email UNIQUE

RefreshToken.token_hash UNIQUE
RefreshToken.account_id
RefreshToken.family_id
(Store only the SHA-256 hash of a refresh token, never the token itself)

Product.sku UNIQUE
Product.supplier_barcode UNIQUE

StorageLocation (warehouse_id, code) UNIQUE
StorageLocation.endpoint_id UNIQUE

Container.barcode UNIQUE
Container.product_id
Container.current_storage_location_id
Container.status

InventoryStock
(product_id, storage_location_id, level_no) UNIQUE

TransportRequest.request_code UNIQUE
TransportRequest.status
TransportRequest.requested_by
TransportRequest (status, submitted_at)

TransportRequestDetail (transport_request_id, sequence_no) UNIQUE
TransportRequestDetail (transport_request_id, container_id) UNIQUE
TransportRequestDetail.transport_request_id
TransportRequestDetail.container_id
TransportRequestDetail.status

Workflow (code, version_no) UNIQUE
Workflow.status

WorkflowTask (workflow_id, sequence_no)
WorkflowStep (workflow_task_id, sequence_no)

Job.job_no UNIQUE
Job.status
Job (status, queued_at)
(Do not store Job.transport_request_id — Request↔Job via JobContainer)

JobContainer (job_id, container_id) UNIQUE
JobContainer (job_id, sequence_no) UNIQUE
JobContainer.transport_request_id
JobContainer.container_id
JobContainer.status

JobTask (job_id, sequence_no)
JobStep (job_task_id, sequence_no)

Robot.code UNIQUE
Robot.status
Robot.last_heartbeat_at

DispatchDecision.job_id

MapVersion (warehouse_id, version_no) UNIQUE
Endpoint (map_version_id, code) UNIQUE
Zone (map_version_id, code) UNIQUE
Edge (map_version_id, code) UNIQUE
```

Use partial unique indexes for active JobAssignment constraints:
- one active assignment per Robot;
- one active assignment per Job.

Only add GIN indexes on JSONB when actual queries use JSON containment/keys.

## Mongo indexes
```text
issue_reports:
- status
- reported_by
- reported_at desc
- job_id
- transport_request_id

notifications:
- (receiver_account_id, is_read, created_at desc)

audit_logs:
- (entity.type, entity.id)
- actor_account_id
- correlation_id
- occurred_at desc
```

## Migrations
Each PostgreSQL module owns its migration folder.
Use design-time DbContext factories.

Development:
- Host may auto-apply pending migrations;
- ensure Mongo indexes.

Production:
- no automatic migration by default.

Review migration changes like code.

## Seed
Only deterministic Development seed data.
Temporary current-user identity must be behind `ICurrentUser`, never hard-coded in feature handlers.

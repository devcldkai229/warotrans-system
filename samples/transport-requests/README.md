# Demo TransportRequest → Job runtime (WTCP-52 + WTCP-53) — chạy thật từ đầu đến cuối

Bộ mẫu này gọi **API thật**, khác với `samples/job-runtime-demo/assumed-fixtures/` (chỉ là dữ liệu giả lập khi chưa có API):

1. Tạo TransportRequest + Details (WTCP-52) → `SUBMITTED`, chưa có Job.
2. Queue request (WTCP-53) → planner lập `JobBatchPlan` → `IJobRuntimeProvisioner` tạo Job / JobContainer / JobTask / JobStep → `QUEUED`.

Hai kịch bản:

| Request | Detail | Ý nghĩa |
|---|---|---|
| 1 | C1 A→D, C2 A→E, C3 A→F | Chung điểm lấy A: chỉ **1** lần MOVE_PICKUP tại A, 3 lần PICKUP_CONFIRM |
| 2 | C6 A→D, C7 B→E, C8 C→F | Lấy ở A, B, C **xong hết** rồi mới giao D, E, F |

## Cách chạy

```powershell
# 1. Hạ tầng (PostgreSQL 5433, Mongo 27018, Mosquitto)
cd infrastructure; docker compose up -d; cd ..

# 2. Backend ở Development (tự apply migration + seed tài khoản admin/staff)
dotnet run --project backend/src/WaroTrans.Host --launch-profile http

# 3. Ở terminal khác: chạy demo
powershell -ExecutionPolicy Bypass -File samples/transport-requests/run-demo.ps1
```

Script chạy lại nhiều lần được. Mỗi lần chạy:
- xoá Job runtime và request demo cũ của các container demo;
- tạo một MapVersion mới (publish map mới sẽ tự archive map cũ);
- dùng lại Workflow `INTERNAL_RELOCATION` đã PUBLISHED, nếu chưa có thì tạo mới.

> Lưu ý: integration test mặc định dùng chung DB ở cổng 5433 và **truncate toàn bộ bảng**. Nên chạy test trên DB riêng:
> `ConnectionStrings__PostgreSQL="Host=localhost;Port=5433;Database=warotrans_it;Username=warotrans;Password=warotrans"`.

## Luồng script thực hiện

| Bước | API / thao tác | Ai gọi | File |
|---|---|---|---|
| 0 | Seed Warehouse, Product, Container C1–C8 bằng SQL (chưa có API tạo Warehouse) | psql | `00-seed.warehouse.sql` |
| 1 | `POST /api/identity/login` | admin, staff | `requests/01-login.request.json` → `responses/01-login.staff.account.json` |
| 2 | `POST /api/navigation/warehouses/{warehouseId}/maps` | admin | `requests/02-map.create.request.json` → `responses/02-map.create.response.json` |
| 3 | `POST /api/navigation/maps/{mapId}/endpoints` ×6 (A–F) | admin | `requests/03-endpoints.request.json` → `responses/03-endpoints.create.response.json` |
| 4 | `POST /api/navigation/maps/{mapId}/publish` | admin | `responses/04-map.publish.response.json` |
| 5 | Workflow `INTERNAL_RELOCATION`: tạo + publish từ `../workflows/INTERNAL_RELOCATION.request.json` | admin | `responses/05-workflow.*.json` |
| 6 | **`POST /api/transportation/transport-requests`** (request 1) | **staff** | `requests/04-transport-request.template.json` → `responses/06-transport-request.request.json` / `.response.json` |
| 7 | Đọc lại các dòng trong `transportation.*`; kiểm tra **chưa có** Job | psql | `responses/07-db.transport-request.rows.txt` |
| 8 | **`POST /api/transportation/transport-requests/{id}/queue`** (gọi 2 lần → cùng Job) | **staff** | `responses/08-queue.response.json`, `08-queue.again.response.json` |
| 9 | Cây Job runtime của request 1 | psql | `responses/09-job.runtime.graph.txt` |
| 10 | Tạo + queue request 2 | staff | `requests/05-transport-request-2.template.json` → `responses/10-*.json`, `11-queue-2.response.json`, `12-job.runtime.graph-2.txt` |
| 11 | Các ca lỗi | staff | `responses/errors/*.json` |

Template chứa `{{MAP_VERSION_ID}}`, `{{WORKFLOW_ID}}`, `{{EP_A}}`… vì các id này do server sinh ra ở bước 2–5.
`responses/06-…request.json` / `10-…request.json` là body thật đã điền id.

## Kết quả mong đợi

**Sau khi tạo (bước 6–7):**
- Response `201 Created`: `status = SUBMITTED`, `planSchemaVersion = 1`, 3 detail đều `PENDING`, `requestCode = REQ-YYYYMMDD-NNNNNN`.
- `requestedBy` = id tài khoản staff `a0000000-0000-4000-8000-000000000002` (lấy từ token, client không gửi).
- DB có 1 dòng `transport_requests` và 3 dòng `transport_request_details`, **chưa có Job** (`jobs_for_demo_containers = 0`).

**Sau khi queue (bước 8–10):**
- Response `200`: `status = QUEUED`, 1 Job (`batchKey = BATCH-001`, `JOB-YYYYMMDD-NNNNNN`). Request và Details chuyển `QUEUED`.
- Gọi queue lần 2 trả về **cùng** `jobId`, không tạo thêm dòng nào (`ProvisioningKey = {requestId}:BATCH-001`).
- Job `CREATED`, 3 JobContainer `PENDING`, chưa gán robot.
- Cây Job request 1 (11 JobTask / 17 JobStep):

```
1  JOB                         CHECK_READY, CHECK_BATTERY, CHECK_REQUEST
2  STOP PICKUP A               CHECK_SOURCE_ENDPOINT, MOVE_PICKUP
3  C1 @ PICKUP A  (A -> D)     PICKUP_CONFIRM
4  C2 @ PICKUP A  (A -> E)     PICKUP_CONFIRM
5  C3 @ PICKUP A  (A -> F)     PICKUP_CONFIRM
6  STOP DROPOFF D              CHECK_DEST_ENDPOINT, MOVE_DROPOFF
7  C1 @ DROPOFF D (A -> D)     DROPOFF_CONFIRM
8  STOP DROPOFF E  …  11  C3 @ DROPOFF F
```

- Cây Job request 2 (13 JobTask / 21 JobStep): STOP PICKUP A → C6, STOP PICKUP B → C7, STOP PICKUP C → C8, rồi STOP DROPOFF D/E/F.
- Cột `current_movement` trong file graph là CURRENT_MOVEMENT mà runtime dùng cho container đó (lấy từ Detail).

**Giả định V1:** chưa có model sức chở robot, nên mỗi request là **1 batch** chứa toàn bộ container.

## Các ca lỗi (`responses/errors/`)

| File | Tình huống | HTTP | `code` |
|---|---|---|---|
| `01-container-already-requested.json` | Gửi lại request với C1–C3 đang thuộc request active | 409 | `container_already_requested` |
| `02-container-not-eligible.json` | C4 đang `RESERVED` | 400 | `container_not_eligible` |
| `03-container-not-found.json` | Container không tồn tại | 404 | `container_not_found` |
| `04-endpoint-not-found.json` | Endpoint đích không tồn tại | 404 | `endpoint_not_found` |
| `05-duplicate-sequence-and-container.json` | Trùng `sequenceNo` và trùng container | 400 | `validation_failed` |
| `06-no-details.json` | Không có Detail | 400 | `validation_failed` |
| `07-movement-key-in-workflow-inputs.json` | Đưa `containerId` vào `workflowInputs` | 400 | `validation_failed` |
| `08-workflow-not-found.json` | Workflow không tồn tại | 404 | `workflow_not_found` |

Sau các ca lỗi, script kiểm tra DB không có dòng nào cho C4/C5. Nghĩa là request lỗi không để lại dữ liệu dở dang.

## Không làm trong demo này

Không gán Robot, không chạy Job (vòng lặp thực thi), không HumanTask, không MQTT/Nav2. Access token không được ghi ra file.

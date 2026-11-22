# WaroTrans: nghiệp vụ, trạng thái và một Transport Request từ đầu tới cuối

Tài liệu học dự án, đi kèm `WAROTRANS_TU_HE_THONG_XUONG_MOTOR.md`. Tên trạng thái, tên step và quy tắc đều lấy từ code
`warotrans-system/backend` tại ngày 2026-11-23.

---

## 1. Hệ thống làm gì

Kho có kệ (shelf), cổng nhập (INBOUND), cổng xuất (OUTBOUND) và khu kiểm tra (INSPECTION). Hàng nằm trong **container**
có mã vạch. Robot tự hành chở container giữa các điểm. Nhân viên chỉ làm hai việc: **đặt hàng lên** và **lấy hàng xuống**,
rồi quét mã để xác nhận.

```
Nhân viên tạo yêu cầu "chở container C từ A tới B"  (Transport Request)
   → hệ thống chia thành chuyến xe                  (Job)
   → chọn robot rảnh tốt nhất                       (Dispatch)
   → robot đi tới A, người bỏ hàng lên, quét mã      (MOVE + HUMAN_INTERACTION)
   → robot đi tới B, người lấy hàng xuống, quét mã
   → tồn kho cập nhật: container giờ nằm ở B        (Warehouse posting)
```

---

## 2. Các module (bounded context) và việc của từng module

| Module | Sở hữu | Không được làm |
|---|---|---|
| **Identity** | user, role (Admin, Staff, Technician), kho đang làm việc, work zone | |
| **Warehouse** | kho, kệ (storage location), sản phẩm, **container**, tồn kho, phiếu nhập/xuất (stock voucher) | không biết robot |
| **Navigation** | map version, endpoint, lane (edge), zone, nhóm endpoint | không biết job |
| **Transportation** | **Transport Request (TR)**, từng dòng (Detail), huỷ TR, ghi sổ tồn kho khi giao nhận | không tự tạo Job: phải gọi WorkflowExecution |
| **WorkflowExecution** | **Workflow** (mẫu quy trình), **Job / JobTask / JobStep**, hàng đợi, engine chạy step, handover stop, recovery | không gửi MQTT trực tiếp: gọi Fleet |
| **Fleet** | robot, lệnh robot (command), dispatch, **traffic**, telemetry, heartbeat | không biết TR |
| **Operations** | issue (sự cố), hazard (nguy hiểm trong kho), thông báo | |
| **EvidenceBridge** | đẩy sự kiện sang Evidence Recorder (ghi lại để xem lại / replay) | |

Các module nói chuyện với nhau qua **contract** (`I…Module`, DTO) và **integration event** (ví dụ `JobContainerStatusChanged`),
không đọc bảng của nhau.

---

## 3. Các khái niệm chính

### 3.1 Workflow: mẫu quy trình

- Admin dựng trên web, publish rồi mới dùng được (`workflow_not_published`).
- Gồm **WorkflowTask**, mỗi task gồm **WorkflowStep**.
- **Loại step** (`StepType`):

| Step | Làm gì | Ví dụ |
|---|---|---|
| `MOVE` | robot đi tới một endpoint, có `purpose`: PICKUP / DROPOFF / TRANSIT | `MOVE_TO_INBOUND_AREA` |
| `HUMAN_INTERACTION` | chờ người xác nhận, thường là quét mã | `CONFIRM_GOODS_PICKUP` |
| `CHECK` | kiểm tra điều kiện (pin, sẵn sàng…) | `CHECK_READY` |
| `WAIT` | chờ một khoảng thời gian | |

- **Biến workflow** (`variables_schema`), theo nguồn giá trị:
  - `SYSTEM_VALUE`: hệ thống điền, ví dụ `assignedRobotId`.
  - `ADMIN_INPUT`: Admin cấu hình một lần, ví dụ `inboundEndpointId` = endpoint cổng nhập.
  - `STAFF_INPUT`: nhân viên trả lời khi tạo TR, ví dụ `checkQuality` = có ghé INSPECTION không.
- **Input của step** lấy từ đâu (`input_bindings`):
  - `CONSTANT`: giá trị cố định.
  - `WORKFLOW_VAR`: lấy từ biến workflow.
  - `CURRENT_MOVEMENT`: lấy từ dòng TR đang xử lý, ví dụ `source.endpointId`, `destination.endpointId`, `containerId`.
- **Khi step lỗi** (`OnFailure`): `FAIL_JOB`, `PAUSE_FOR_OPERATOR` hoặc `REQUEST_REASSIGN`.
- **Phạm vi lặp** của task:
  - `ONCE_PER_JOB`: một lần cho cả chuyến.
  - `ONCE_PER_STOP`: một lần mỗi điểm dừng, ví dụ MOVE.
  - `PER_CONTAINER_AT_STOP`: mỗi container tại mỗi điểm, ví dụ xác nhận.

**Workflow đang có:** `INBOUND`, `OUTBOUND_RETRIEVAL`, `INTERNAL_RELOCATION`, `ROBOT_RETURN_TO_PARK`, `ROBOT_CHARGING`.

Ví dụ INBOUND:

```
MOVE_TO_INBOUND_AREA        (MOVE, PICKUP, đích = biến inboundEndpointId)
CONFIRM_GOODS_PICKUP        (HUMAN, mỗi container)
MOVE_TO_INSPECTION          (MOVE, chỉ khi checkQuality = true)
CONFIRM_QUALITY_INSPECTION  (HUMAN)
MOVE_TO_STORAGE_LOCATION    (MOVE, DROPOFF, đích = destination.endpointId)
CONFIRM_GOODS_STORAGE       (HUMAN, mỗi container)
```

### 3.2 Transport Request (TR) và Detail

- **TR** là một yêu cầu của nhân viên, gồm workflow, map, kho, câu trả lời `workflowInputs`, và nhiều **Detail**.
- **Detail** là một dòng: `containerId`, `source` (endpoint, kệ, tầng) → `destination` (endpoint, kệ, tầng).
- Một container chỉ được nằm trong một TR đang mở (ràng buộc V1).

### 3.3 Job, JobTask, JobStep, JobContainer

- **Job** là **một chuyến xe**.
  - Một TR có thể sinh nhiều Job: mỗi Job chở tối đa `JobPlanning:MaxContainersPerJob` container, và không quá sức chứa của robot (`maxContainers`).
  - Kế hoạch chuyến gọi là `JobBatchPlan`, gồm các **stop**. Ví dụ 3 container cùng nhặt ở A, trả ở D, E, F:
    `A PICKUP C1,C2,C3 → D DROPOFF C1 → E DROPOFF C2 → F DROPOFF C3`.
- **JobTask / JobStep**: bản sao cụ thể của các task/step trong workflow, đã thay endpoint và container thật vào.
- **JobContainer**: một container trong chuyến, có trạng thái riêng (mục 4.3).
- **JobRobotAssignment**: robot nào đang chạy Job này, từ lúc nào tới lúc nào.
- `Job.ProvisioningKey = {trId}:{batchKey}` có unique index, nên gọi tạo lại nhiều lần cũng không sinh Job trùng (idempotent).

### 3.4 Handover stop: điểm giao nhận

Mỗi lần robot dừng để người bỏ hoặc lấy hàng là một **handover stop**:
1. **offer:** mở 10 s sau khi robot ACK lệnh MOVE tới điểm đó. Robot chưa cần tới nơi, nhân viên có thể nhận việc trước.
2. **claim:** một nhân viên nhận việc. Nếu robot đã tới thì có hạn phải bắt đầu (begin).
3. **begin:** người bắt đầu thao tác. Từ đây, việc thuộc về người đó cho tới khi xong.
4. **confirm:** quét **đủ và đúng** mã của mọi container tại điểm đó. Sai một mã thì cả điểm không đổi gì.
5. Có thêm `release` (trả việc), `heartbeat` (giữ việc trước khi begin) và `extend` (xin thêm giờ).

**Work zone:**
- Nhân viên chọn khu làm việc. Polygon `ZONE-AREA-*` trên map quyết định điểm nào thuộc khu nào.
- Người trong khu được ưu tiên nhận việc trong vài giây đầu, sau đó cả kho đều nhận được.

**Báo sự cố khi giao nhận:** `WRONG_CONTAINER`, `MISSING_CONTAINER`, `BARCODE_UNREADABLE`, `CONTAINER_DAMAGED`, `QUANTITY_MISMATCH`.
Sự cố sai container hoặc thiếu container chưa giải quyết thì **chặn nút xác nhận** (`handover_issue_blocking`).

---

## 4. Máy trạng thái

### 4.1 Transport Request (`TransportRequestStatus`)

```
SUBMITTED ──queue──► QUEUED ──Job đầu chạy──► IN_PROGRESS ──► COMPLETED
                                                  │                ▲
                                                  ├──► PARTIALLY_COMPLETED (có dòng xong, có dòng lỗi)
                                                  ├──► FAILED (không dòng nào xong)
   cancel ─────────────────────────────────────► CANCELLING ──hàng trên robot đã xử lý──► CANCELLED
   validate lỗi ──► REJECTED
```

**Không ai set trạng thái TR bằng tay.** `TransportRequest.ApplyDetailProgress` **tính lại** trạng thái từ các Detail mỗi khi một container đổi trạng thái:

| Tình huống của các Detail | TR |
|---|---|
| Tất cả đã xong (terminal), tất cả COMPLETED | `COMPLETED` |
| Tất cả terminal, có ít nhất một COMPLETED | `PARTIALLY_COMPLETED` (đóng) |
| Tất cả terminal, không cái nào COMPLETED, TR đang CANCELLING hoặc tất cả CANCELLED | `CANCELLED` |
| Tất cả terminal, không cái nào COMPLETED, còn lại | `FAILED` |
| Còn dòng mở, TR đang CANCELLING | giữ `CANCELLING` (chờ hàng trên robot) |
| Còn dòng mở, đã có COMPLETED hoặc FAILED | `PARTIALLY_COMPLETED` |
| Còn dòng mở, có IN_PROGRESS hoặc CANCEL_PENDING_RECOVERY | `IN_PROGRESS` |

### 4.2 Detail (`TransportRequestDetailStatus`)

`PENDING → QUEUED → IN_PROGRESS → COMPLETED | FAILED | CANCELLED`, thêm `CANCEL_PENDING_RECOVERY`.

Detail đi theo JobContainer, nối với nhau qua RequestId + ContainerId:

| JobContainer | → Detail |
|---|---|
| ASSIGNED, ONBOARD | IN_PROGRESS |
| DELIVERED | COMPLETED |
| FAILED | FAILED |
| CANCELLED | CANCELLED |

Một Detail đang `CANCEL_PENDING_RECOVERY` chỉ thoát ra khi Job kết thúc container đó. Robot nhặt lại container không làm nó quay về IN_PROGRESS.

### 4.3 JobContainer (`JobContainerStatus`)

```
PENDING ──Job có robot──► ASSIGNED ──xác nhận PICKUP──► ONBOARD ──xác nhận DROPOFF──► DELIVERED
                                         │                  │
                                         └── lỗi / huỷ ─────┴──► FAILED | CANCELLED
```

**ONBOARD là trạng thái quan trọng nhất:**
- Hàng **đang nằm trên robot**.
- Mọi quyết định huỷ, mất robot hay chuyển robot đều phải biết container có ONBOARD không.
- Có hàng trên xe thì không thể bỏ chuyến, phải **recovery**.

### 4.4 Job (`JobStatus`)

```
CREATED ──enqueue (người bấm, hoặc tự động khi TR đã có chuyến chạy)──► QUEUED
QUEUED ──dispatch chọn robot──► ASSIGNED ──bắt đầu step đầu──► RUNNING ──step cuối xong──► COMPLETED
RUNNING ──người bấm Pause / robot NAVIGATION_BLOCKED / step PAUSE_FOR_OPERATOR──► PAUSED ──Resume──► RUNNING
RUNNING|PAUSED ──robot mất kết nối, KHÔNG có hàng──► REASSIGNING ──► QUEUED (robot khác nhận lại)
RUNNING|PAUSED ──robot mất kết nối, CÓ hàng ONBOARD──► RECOVERY_REQUIRED ──(chuyển hàng sang robot khác / quay lại robot cũ)──► PAUSED → RUNNING
step lỗi với FAIL_JOB ──► FAILED          huỷ ──► CANCELLED
```

Các chỗ trong code: `EnqueueAsync`, `ResumeAsync`, `HandleOfflineRobotsAsync` (sang REASSIGNING),
`RequeueTripsOfLostRobotsAsync` (sang QUEUED), `Job.EnterRecovery` (sang RECOVERY_REQUIRED), `PauseAsync`,
`CancelForTransportRequestAsync`.

### 4.5 JobStep (`JobStepStatus`)

```
PENDING ──đến lượt──► READY ──engine bắt đầu──► EXECUTING ──► COMPLETED
                                  │   ▲
                                  ▼   │ (mỗi giây xét lại)
                               WAITING   (chờ goal trống, chờ ở queue point, đang nhường đường, chờ người)
EXECUTING|WAITING ──► FAILED | CANCELLED | PAUSED ;  step điều kiện không cần chạy ──► SKIPPED
```

**Ý nghĩa của WAITING với một MOVE:**
- Robot **chưa** được đi tới goal.
- Lý do và chỗ chờ nằm trong `outputValues`:
  - `areaQueueZone`: `GOAL:EP-INBOUND` (goal bận) hoặc `area_queue:DEADLOCK_RETREAT` (đang nhường);
  - `areaWaitSince`: chờ từ lúc nào, dùng để ai chờ trước đi trước;
  - `goalBlockedByRobotId`: robot đang chặn;
  - `retreatToEndpointId` hoặc `retreatToPose`: chỗ né tới;
  - `waitingFor`: câu mô tả hiện trên web.

### 4.6 Robot (`RobotStatus`) và lệnh robot (`RobotCommandStatus`)

```
OFFLINE ──heartbeat + put-in-service──► AVAILABLE ──nhận Job──► RESERVED ──chạy──► EXECUTING ──Job xong──► AVAILABLE
EXECUTING ──Pause──► PAUSED ;  AVAILABLE ──► CHARGING | MAINTENANCE ;  lỗi ──► ERROR ;  mất heartbeat ──► OFFLINE
```

Song song có:
- `LocalizationStatus`: `LOCALIZED` / `LOST` / `UNKNOWN`. Robot chỉ nhận MOVE khi đã LOCALIZED; nếu chưa, staff bấm LOCALIZE trên web.
- `isOnline`: heartbeat 1 Hz, quá `Mqtt:HeartbeatTimeoutSeconds` không có thì offline.

**Lệnh robot:**

```
SENT ──command_ack accepted──► ACKED ──► RUNNING ──command_result──► COMPLETED | FAILED | CANCELED
     └─ack accepted=false──► REJECTED ;  không ACK kịp ──► TIMEOUT ;  backend huỷ khi robot mất ──► ABORTED
```

### 4.7 Container trong kho (`ContainerStatus`, module Warehouse)

```
CREATED / PACKED ──(gắn vào phiếu, TR)──► RESERVED ──nhặt lên robot──► IN_TRANSIT ──giao lên kệ──► STORED
                                                                    └─giao tới cổng xuất có phiếu xuất CONFIRMED──► ISSUED (rời kho)
                                                                    └─giao tới cổng xuất không có phiếu──► HOLD (chờ người xử lý)
STORED ──► EMPTY / OUT_OF_SERVICE
```

**Tồn kho không đổi ngay khi người bấm xác nhận.** Thứ tự xử lý:
1. Engine ghi một **outbox row** trong cùng transaction với xác nhận.
2. Transportation tạo một **posting**, khoá theo Job + Container + phase (pickup/delivery). Khoá này đảm bảo không ghi hai lần.
3. Hệ thống gửi sang Warehouse và **thử lại** cho tới khi thành công. Delivery luôn chờ pickup của cùng container đã ghi xong.

---

## 5. Các cơ chế bên dưới

| Cơ chế | Ở đâu | Làm gì |
|---|---|---|
| **Hàng đợi Job** | `JobQueueHostedService` → `JobQueueProcessor` (mỗi vài giây) | lấy Job QUEUED, chọn robot, bắt đầu chạy. Khi một chuyến của TR xong, chuyến kế của TR đó tự vào hàng. Chuyến của robot bị mất (không có hàng) được ưu tiên trước |
| **Chọn robot** | `DispatchEligibility` (Fleet) | điều kiện: online, LOCALIZED, AVAILABLE, đúng map, pin ≥ ngưỡng và còn mới (≤ 15 s), đủ sức chứa. Điểm (thấp là tốt) = khoảng cách tới điểm nhặt × 1.0 + (100 − %pin) × 0.05 − 0.5 nếu robot đã rảnh lâu. Robot đang chỉ trên đường về parking vẫn được tính là rảnh. Mọi quyết định được ghi lại (`DispatchDecision`) |
| **Engine chạy step** | `JobExecutionEngine` (start, advance, handle result) | mỗi step: resolve input, chạy, nhận kết quả, sang step kế. MOVE thì gửi NAVIGATE qua Fleet |
| **Kết quả lệnh robot** | `ProcessRobotCommandResultHandler` | đóng lệnh, đóng route traffic, báo engine để MOVE thành COMPLETED hoặc lỗi |
| **Traffic** | `TrafficState` (Fleet) | cấp ô/zone cho từng plan của robot (xem tài liệu kia, mục 4) |
| **Chờ goal / queue point / nhường đường** | `JobExecutionEngine.WaitPoints.cs`, `ResolveDeadlocksAsync` | chờ tại chỗ → queue point gần goal → né sang chỗ trống |
| **Robot rảnh chắn đường** | `RobotCareService` | dời robot rảnh đi, hoặc đưa về parking (`FleetIdle:AutoReturnToPark`) |
| **Robot mất kết nối** | `RobotOfflineJobHostedService` | không hàng thì REASSIGNING; có hàng thì RECOVERY_REQUIRED |
| **Người không xác nhận** | `HumanConfirmTimeoutHostedService`, `StalledWorkMonitorHostedService` | nhắc, báo quá hạn, phát hiện việc bị treo |
| **Step WAIT** | `WaitStepWakeupHostedService` | đánh thức step tới giờ |
| **Realtime** | SignalR `/hubs/notifications` | `jobStatusChanged`, `handoverStopsChanged`… web/app tải lại dữ liệu |
| **Khoá đồng thời** | `Version` / `UpdatedAt` (optimistic concurrency), `AreaGate` (semaphore trong engine) | hai người hay hai luồng sửa cùng một Job thì một bên phải thử lại |

---

## 6. Một TR từ đầu tới cuối: INBOUND, 2 container

**Bối cảnh:**
- Map MAP-ONE-V015.
- Robot: RBT-001 ở EP-PARKING-A (pin 80 %), RBT-002 ở EP-PARKING-B (pin 60 %). Cả hai AVAILABLE và LOCALIZED.
- `MaxContainersPerJob = 1` (giá trị thật của lab).

### 6.1 Tạo TR (t = 0 s)

Nhân viên mở app, chọn workflow INBOUND, trả lời "Check Quality? = Không", chọn 2 container C1 → SHELF-C-1 và C2 → SHELF-B-01-02.

`POST /api/transportation/transport-requests`:
1. Kiểm tra payload. `WorkflowRequestValidator` kiểm tra:
   - workflow đã publish;
   - có đủ STAFF_INPUT;
   - điểm nhặt **phải** là `inboundEndpointId` mà Admin đã cấu hình. Sai thì báo `workflow_pickup_endpoint_fixed`.
2. Lưu TR `R…` ở trạng thái **SUBMITTED**, cùng 2 Detail **PENDING**. Container C1, C2 sang **RESERVED** trong Warehouse.
3. Lập kế hoạch: 2 chuyến, vì mỗi chuyến chở 1 container.
   - Job J1: `INBOUND PICKUP C1 → SHELF-C-1 DROPOFF C1`
   - Job J2: `INBOUND PICKUP C2 → SHELF-B-01-02 DROPOFF C2`
4. `JobRuntimeProvisioner` tạo J1, J2 ở trạng thái **CREATED**, sinh JobTask/JobStep từ workflow (bỏ qua nhánh INSPECTION) và JobContainer **PENDING**.

### 6.2 Đưa vào hàng đợi (t = 1 s)

Nhân viên bấm "Bắt đầu" (`POST …/queue`, rồi enqueue):
- J1, J2 sang **QUEUED**; TR sang **QUEUED**; Detail sang **QUEUED**.

### 6.3 Dispatch (t = 2 s)

`JobQueueProcessor` chạy, dùng `DispatchEligibility` xếp hạng robot cho J1 (điểm nhặt INBOUND (2.095, 1.253)):

| Robot | Khoảng cách | Pin | Điểm |
|---|---|---|---|
| RBT-002 | ~3.2 m | 60 % | 3.2 + 40×0.05 = **5.2** |
| RBT-001 | ~3.9 m | 80 % | 3.9 + 20×0.05 = 4.9, trừ 0.5 vì rảnh lâu = **4.4** |

- **J1 → RBT-001**: `JobRobotAssignment` mới; J1 **ASSIGNED** rồi **RUNNING**; RBT-001 **RESERVED** rồi **EXECUTING**; JobContainer C1 **ASSIGNED**; Detail C1 **IN_PROGRESS**; TR **IN_PROGRESS**.
- **J2 → RBT-002** ngay trong cùng lượt, vì robot đó còn rảnh.

### 6.4 MOVE_TO_INBOUND_AREA của J1 (t = 2–30 s)

1. Step **EXECUTING**. Engine lấy endpoint INBOUND (dung sai 0.12 m).
2. Kiểm tra pose RBT-001 còn mới, bundle map khớp, traffic `EnsureTracked` (seed các ô dưới thân xe).
3. `GoalBusyByAsync`: không ai ở INBOUND, đi được.
4. `fleet.NavigateAsync`:
   - lệnh `NAVIGATE_TO_POSE` **SENT** qua MQTT;
   - robot ACK → **ACKED**;
   - Nav2 lập đường → `traffic_plan` → backend cấp ô (`EXTEND_AUTHORITY`) → robot chạy.
5. Sau ACK 10 s, **handover stop offer mở** cho INBOUND. Nhân viên khu INBOUND thấy việc và **claim** trước.

### 6.5 Cùng lúc, J2 cũng muốn tới INBOUND (t = 2 s)

- `GoalBusyByAsync` trả về: "J1 is on its way there".
- `GoalWaitPlaceAsync` xét:
  - RBT-002 ở PARKING-B có chắn đường RBT-001 không? Kiểm tra bằng ô traffic thật: ô dưới thân RBT-002 so với các ô trên đường còn lại của RBT-001.
  - Không chắn: **chờ tại chỗ**. Step J2 **WAITING**, `waitingFor = area_queue:GOAL:EP-INBOUND (J1 is on its way there)`.
  - Nếu chắn: đi tới Queue Point gần INBOUND nhất. Nếu cũng không được: né sang chỗ trống trong vòng 2 m.
- Mỗi giây engine xét lại. Nếu hai robot chờ nhau ở traffic quá 5 s (`DEADLOCK_RISK`), `ResolveDeadlocksAsync` chọn một robot né sang chỗ trống gần. Kết quả thật trong sim: né 0.16–0.44 m.

### 6.6 Tới INBOUND, giao nhận (t = 30–60 s)

1. Nav2 tới đích → `command_result SUCCEEDED`. Lệnh **COMPLETED**; traffic `CompleteRoute` thu vùng chiếm về chỗ robot đứng; MOVE **COMPLETED**.
2. Step `CONFIRM_GOODS_PICKUP` **EXECUTING**: robot đã sẵn sàng (`robotReadyAt`).
3. Nhân viên đã claim → **begin** → đặt C1 lên robot → **quét mã C1** → **confirm**.
   - Mã đúng: step **COMPLETED**; JobContainer C1 **ONBOARD**; Detail C1 vẫn IN_PROGRESS.
   - Outbox pickup → posting → Warehouse: C1 **IN_TRANSIT**, rời khỏi vị trí cũ, vẫn được tính trên slot kế toán.

### 6.7 Rời INBOUND, J2 tiến vào (t = 60–75 s)

1. J1 sang `MOVE_TO_STORAGE_LOCATION` (SHELF-C-1). RBT-001 rời INBOUND.
2. Trong 1 m đầu khi RBT-001 rời đi, J2 vẫn thấy "is pulling out of it" và tiếp tục chờ.
3. RBT-001 đã cách INBOUND hơn 1 m: J2 hết bận → J2 gửi NAVIGATE tới INBOUND. Hai robot chạy **song song**: RBT-001 xuống lane, RBT-002 lên INBOUND.

### 6.8 Giao C1 lên kệ (t = 75–110 s)

1. RBT-001 tới SHELF-C-1 → `CONFIRM_GOODS_STORAGE` → nhân viên quét C1.
2. JobContainer C1 **DELIVERED** → Detail C1 **COMPLETED** → TR tính lại:
   - C2 còn đang chạy, nên còn dòng mở và đã có một dòng COMPLETED → **PARTIALLY_COMPLETED**.
   - Đây là trạng thái trung gian. Trạng thái này chỉ "đóng" khi mọi dòng đã terminal.
3. Posting delivery → Warehouse: C1 **STORED** ở kệ SHELF-C-1, tồn kho kệ C tăng.
4. Step cuối xong → J1 **COMPLETED**; assignment đóng; RBT-001 **AVAILABLE**. Nếu bật AutoReturnToPark, RobotCare đưa robot về PARKING-A.

### 6.9 J2 hoàn tất (t = 110–150 s)

RBT-002 đi theo đúng chuỗi trên với C2 → SHELF-B-01-02. Detail C2 **COMPLETED** → mọi dòng COMPLETED → **TR COMPLETED**, `CompletedAt` được ghi.

### 6.10 Tóm tắt dòng thời gian

| t | TR | J1 | J2 | C1 (Job) | C1 (kho) | RBT-001 |
|---|---|---|---|---|---|---|
| 0 | SUBMITTED | CREATED | CREATED | PENDING | RESERVED | AVAILABLE |
| 1 | QUEUED | QUEUED | QUEUED | PENDING | RESERVED | AVAILABLE |
| 2 | IN_PROGRESS | RUNNING | RUNNING (MOVE WAITING) | ASSIGNED | RESERVED | EXECUTING |
| 55 | IN_PROGRESS | RUNNING | RUNNING | ONBOARD | IN_TRANSIT | EXECUTING |
| 105 | PARTIALLY_COMPLETED | COMPLETED | RUNNING | DELIVERED | STORED | AVAILABLE |
| 150 | COMPLETED | COMPLETED | COMPLETED | DELIVERED | STORED | AVAILABLE |

---

## 7. Nhánh bất thường

| Sự kiện | Hệ thống làm gì |
|---|---|
| **Huỷ TR khi chưa nhặt** | TR sang CANCELLING; Job huỷ; container CANCELLED; TR sang CANCELLED; container trong kho quay về như cũ |
| **Huỷ TR khi hàng đang ONBOARD** (TRN-03) | Detail sang CANCEL_PENDING_RECOVERY. Robot **không được bỏ hàng giữa đường**: nhân viên chọn **recovery point** (`…/cancellation/jobs/{job}/recovery`), robot chở tới đó. Sau đó nhân viên chọn: **dỡ hàng** (quét mã, container về kho) hoặc **giao tiếp** (`…/deliver`). Xong thì TR sang CANCELLED, hoặc PARTIALLY_COMPLETED nếu có dòng đã giao |
| **Robot mất kết nối, không có hàng** | Job sang REASSIGNING rồi QUEUED; robot khác nhận chuyến. Lệnh cũ ABORTED |
| **Robot mất kết nối, có hàng** | Job sang RECOVERY_REQUIRED. Nhân viên mở recovery case: claim; chọn robot cứu; robot cứu tới; quét chuyển hàng (`transfer-confirm`) hoặc dùng nút trên robot (`arm-button`). Job sang PAUSED, sau đó Resume |
| **Nav2 không tới được đích** (`NAVIGATION_BLOCKED`) | tuỳ `OnFailure` của step: PAUSE_FOR_OPERATOR thì Job PAUSED và người xem rồi Resume; FAIL_JOB thì FAILED |
| **Quét sai container** | xác nhận bị từ chối, không đổi gì. Báo issue `WRONG_CONTAINER` thì nút xác nhận bị khoá cho tới khi issue được giải quyết |
| **Người không xác nhận** | nhắc rồi báo quá hạn. Robot đứng chờ, giữ ô dưới thân, robot khác đi vòng hoặc chờ |
| **Hai robot cần cùng chỗ** | traffic cấp theo ô; goal bận thì chờ, quy tắc ở mục 6.5 |
| **Host restart giữa chừng** | traffic dựng lại từ báo cáo của robot (reconcile). Không nên restart khi đang có job (bài học ngày 2026-11-22) |

---

## 8. Bài tập tự kiểm tra

1. TR có 3 container, 2 đã DELIVERED, 1 FAILED. TR ở trạng thái gì? *(PARTIALLY_COMPLETED, đã đóng)*
2. Robot mất mạng khi C1 đang ONBOARD. Job đi qua những trạng thái nào? *(RUNNING → RECOVERY_REQUIRED → … → PAUSED → RUNNING)*
3. Vì sao TR không bao giờ được set COMPLETED bằng tay? *(trạng thái được tính lại từ Detail, `ApplyDetailProgress`)*
4. Khi nào handover offer mở, và nhân viên có claim trước khi robot tới được không? *(10 s sau ACK; được)*
5. Tồn kho cập nhật ngay lúc quét mã phải không? *(không: outbox → posting → Warehouse, có thử lại; delivery chờ pickup ghi xong)*

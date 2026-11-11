# OUTBOUND_RETRIEVAL, INTERNAL_RELOCATION và Auto Return-to-Parking

Ngày: 2026-11-10. Đặc tả: `samples/workflows/WaroTrans_OUTBOUND_INTERNAL_RELOCATION_Seed_Blueprint.json`.

> **Không có PHYSICAL PASS.** Mọi bằng chứng dưới đây là test tự động (unit/integration) trên `warotrans_test` và seed trên DB dev. Chưa chạy hai workflow hay auto-park trên robot thật.

## 1. Kết quả ngắn

| Hạng mục | Trạng thái | Nhánh |
|---|---|---|
| Seed hai workflow (DRAFT → validate → PUBLISH, idempotent) | Xong; đã seed DB dev `warotrans` và `warotrans_test` | `feature/outbound-relocation-workflows` (từ `develop`) |
| Kiểm tra request theo workflow + pickup đúng kệ + nguồn ≠ đích | Xong | như trên |
| Auto Return-to-Parking = Fleet positioning intent | Xong trong code + test; **chưa áp vào DB dev**, **mặc định tắt** | `feature/auto-park-positioning-intent` (từ `feature/park-and-workflow-catalog`) |

Hai nhánh chưa commit/push.

## 2. Audit: blueprint → schema thật

| Blueprint | Schema / code hiện hành | Ghi chú |
|---|---|---|
| `operation: LOOKUP_REAL_MOVE_OPERATION…` | `config.operationCode` = `PICKUP` / `DROPOFF` (MovePurpose) | `OperationExecutionScopeCatalog` |
| `scope: ONCE_PER_DISTINCT_PICKUP_STOP` | không lưu trên step; suy ra từ (MOVE, PICKUP) → `ONCE_PER_STOP` lọc PICKUP | không có cột scope, không chèn JSON |
| `scope: ONCE_PER_CONTAINER_AT_PICKUP_STOP` | (HUMAN_INTERACTION, PICKUP_CONFIRM) → `PER_CONTAINER_AT_STOP` | |
| binding `CURRENT_MOVEMENT.sourceEndpointId` | `sourceType: CURRENT_MOVEMENT`, `sourceReference: "source.endpointId"` | `CurrentMovementCatalog` |
| `…destinationEndpointId` / `containerId` | `destination.endpointId` / `containerId` | |
| (ngầm) robot | `robotId` ← `WORKFLOW_VAR assignedRobotId` (SYSTEM_VALUE) | bắt buộc với MOVE và *_CONFIRM |
| `onFailure: PAUSE_FOR_OPERATOR` | `StepFailurePolicy.PAUSE_FOR_OPERATOR` | |
| `purpose` | input `purpose` = CONSTANT `"PICKUP"`/`"DROPOFF"` | giống INBOUND đang chạy |

Không dùng WAIT/CHECK. Seed đi qua đúng các handler của API (`CreateWorkflow` → `UpdateWorkflow` / `CreateWorkflowVersion` → `PublishWorkflow`), nên chạy `ValidateDraft` và `ValidateForPublish` thật.

## 3. Seed records (DB dev `warotrans`, 127.0.0.1:5433)

| Code | Version | Status | Id |
|---|---|---|---|
| OUTBOUND_RETRIEVAL | 1 | PUBLISHED | `4bd44bd7-ec02-4e3c-ab41-dc1a0ded2e95` |
| INTERNAL_RELOCATION | 1 | PUBLISHED | `77fb29d1-378c-4169-b74d-0e0c411a4bb3` |

Mỗi workflow (giống nhau về cấu trúc):

| Task (seq) | Step (seq) | Type | Op | targetEndpointId / endpointId | containerId | Timeout | OnFailure |
|---|---|---|---|---|---|---|---|
| COLLECT_CONTAINERS (1) | MOVE_TO_PICKUP (1) | MOVE | PICKUP | `source.endpointId` | – | 360 s | PAUSE_FOR_OPERATOR |
| | CONFIRM_PICKUP (2) | HUMAN_INTERACTION | PICKUP_CONFIRM | `source.endpointId` | `containerId` | 300 s | PAUSE_FOR_OPERATOR |
| DELIVER_CONTAINERS (2) | MOVE_TO_DROPOFF (1) | MOVE | DROPOFF | `destination.endpointId` | – | 360 s | PAUSE_FOR_OPERATOR |
| | CONFIRM_DROPOFF (2) | HUMAN_INTERACTION | DROPOFF_CONFIRM | `destination.endpointId` | `containerId` | 300 s | PAUSE_FOR_OPERATOR |

`created_by` = admin dev `a0000000-0000-4000-8000-000000000001`. Backup bảng workflow trước khi seed: `pg_dump` 3 bảng `execution.workflow*` (file trong scratchpad của phiên).

Chạy lại: `dotnet run --project backend/tools/WorkflowSeed -- [--dry-run] [--database warotrans_test]`. Tool từ chối mọi host không phải local và DB không phải `warotrans` / `warotrans_dev` / `*_test`. Quy tắc idempotent:

- chưa có → tạo v1 DRAFT rồi PUBLISH;
- bản mới nhất là DRAFT → ghi đè định nghĩa rồi PUBLISH;
- bản PUBLISHED giống hệt → `unchanged`;
- bản PUBLISHED khác → tạo version mới rồi PUBLISH; **bản đã PUBLISHED không bị sửa** (Job giữ version đã provision).

Lần chạy thứ hai trên DB dev in ra `unchanged` cho cả hai.

## 4. Kiểm tra request (thay đổi code)

| Quy tắc | Mã lỗi | Ở đâu |
|---|---|---|
| Nguồn và đích khác Endpoint (mọi workflow) | `detail_same_endpoint` | `WorkflowRequestValidator` |
| Container STORED phải được lấy từ đúng kệ đang chứa nó | `container_not_at_source` | `CreateTransportRequestHandler.EnsureContainersAtSource` |
| OUTBOUND_RETRIEVAL: nguồn là storage location | `outbound_source_not_storage` | `WorkflowMovementRules` |
| OUTBOUND_RETRIEVAL: đích không phải kệ | `outbound_destination_is_storage` | như trên |
| INTERNAL_RELOCATION: hai đầu đều là storage location | `relocation_requires_storage_locations` | như trên |
| INTERNAL_RELOCATION: kệ đích khác kệ nguồn | `relocation_same_location` | như trên |

Có sẵn từ trước và vẫn áp dụng: Endpoint cùng map PUBLISHED và enabled; storage location active, cùng kho, gắn đúng Endpoint; container hợp lệ, không trùng trong TR, không nằm trong TR đang chạy; OUTBOUND cần phiếu xuất CONFIRMED.

## 5. Multi-container, grouping, JobContainer, handover

Đã kiểm (planner `CollectThenDeliverJobBatchPlanner` + `JobRuntimeProvisioner` thật, 3 container: C1 A→X, C2 B→Y, C3 A→X):

```
MOVE_TO_PICKUP(A) CONFIRM_PICKUP(C1) CONFIRM_PICKUP(C3) MOVE_TO_PICKUP(B) CONFIRM_PICKUP(C2)
MOVE_TO_DROPOFF(X) CONFIRM_DROPOFF(C1) CONFIRM_DROPOFF(C3) MOVE_TO_DROPOFF(Y) CONFIRM_DROPOFF(C2)
```

- Một MOVE cho mỗi điểm dừng khác nhau; mọi pickup trước mọi dropoff (V1).
- Mỗi bước xác nhận mang `containerId` của chính nó; MOVE không mang `containerId`. Không có "container đầu tiên" ngầm định.
- 3 JobContainer ở `PENDING` sau provision.
- Handover identity: engine đã từ chối container quét khác `containerId` của step (`JobExecutionEngine.ConfirmHumanStepAsync`, có sẵn). Chuyển trạng thái `ONBOARD` / `DELIVERED` cũng có sẵn và được các test hiện có bao phủ; tôi không viết thêm test cho phần đó.
- Lỗi navigation: MOVE dùng `PAUSE_FOR_OPERATOR` → Job dừng chờ người vận hành (cơ chế có sẵn).

**Runtime V1 chưa hỗ trợ / không khẳng định:**

- Không có loại Endpoint "outbound/shipping" trong schema (`EndpointType` = WAYPOINT/CHARGER/PARK). "Đích OUTBOUND là điểm xuất" chỉ được kiểm gián tiếp: đích **không phải kệ**.
- Trên `develop`, một TR = một batch/Job (không chia theo tải). Nhánh `feature/robot-capacity` (FL-03) có chia chuyến theo tải; test grouping ở trên chạy trên `develop`.
- Nhánh park có sẵn file mẫu `samples/workflows/OUTBOUND_RETRIEVAL.request.json` dùng CHECK step, **khác blueprint**. Đó chỉ là mẫu cho test publish; nếu một DB đã publish mẫu đó, seed sẽ tạo version mới theo blueprint.

## 6. Auto Return-to-Parking

### Vì sao không dùng `ROBOT_RETURN_TO_PARK` cho chế độ tự động

`ROBOT_RETURN_TO_PARK` (nhánh park) là một **Job**: nó giữ robot qua `JobRobotAssignment` (một robot một Job). Một Job mới đến lúc robot đang về bãi sẽ không lấy được robot. Ngoài ra Job này còn tính vào thống kê và lịch sử Job. Vì vậy:

- **thủ công** (người bấm "Return to park") → vẫn là Job `ROBOT_RETURN_TO_PARK` như cũ;
- **tự động** → **Fleet-managed positioning intent** `fleet.robot_positioning_intents`: không TransportRequest, không JobContainer, không Job, không giữ assignment.

### Trạng thái

```
NAVIGATING ──(NAVIGATE SUCCEEDED)──────────────► ARRIVED
     │      ──(FAILED / timeout / offline abort)─► FAILED
     │
     └─(Job lấy robot: gửi CANCEL)──► YIELDING ──(NAVIGATE đã kết thúc
                                                 + traffic reconcile OK)──► YIELDED
```

- Unique index một phần (`status IN ('NAVIGATING','YIELDING')`) trên `robot_id` và trên `target_endpoint_id`: DB quyết định khi hai tick/hai host đua nhau. Một robot một intent sống; một bãi chỉ một robot đang tới.
- Chọn bãi: Endpoint `PARK` enabled gần nhất; bỏ bãi đã có intent khác nhắm tới hoặc đang có robot đứng trong tolerance; robot đã đứng ở bãi thì không đi.
- Điều kiện gửi: `FleetIdle:AutoReturnToPark=true`, không có Job QUEUED, robot online, enabled, AVAILABLE, LOCALIZED, telemetry ≤ 10 s, rảnh ≥ `IdleSeconds`, không giữ Job, không MotionHeld hoặc manual.

### Job mới đến khi robot đang về bãi

1. Dispatch vẫn chọn được robot (lý do `NotAvailable` được miễn **chỉ** khi robot RESERVED/EXECUTING vì chính lệnh về bãi; ghi chú `returning_to_park`). Mọi lý do khác (offline, MotionHeld, không localized, pin…) vẫn chặn.
2. Job RUNNING → `YieldPositioningAsync` gửi CANCEL ngay (gửi lại sau 5 s nếu chưa có trả lời).
3. MOVE đầu tiên của Job **không gửi NAVIGATE** cho tới khi:
   - lệnh NAVIGATE về bãi đã kết thúc (RESULT, kết quả CANCEL, timeout hoặc offline abort), và
   - traffic được reconcile từ pose **mới** (≤ `PoseMaxAgeSec`) và LOCALIZED của robot. Một NAVIGATE bị hủy để robot ở trạng thái **QUARANTINED** trong traffic, và chỉ `ReconcileRobot` với robot đang đứng yên mới gỡ được.

   Trong lúc chờ, step ở `WAITING` (`waitingFor` = `positioning_cancel_pending` / `positioning_pose_unverified` / `positioning_traffic_reconcile:*`), và được đánh thức mỗi giây.
4. Quá 60 s → step FAILED `positioning_yield_timeout` → áp `OnFailure` của step. Không bao giờ gửi MOVE khi lệnh về bãi chưa xong.

### MQTT đến muộn, offline

- Kết quả muộn của NAVIGATE về bãi: `RobotCommand.TryApplyResult` bỏ qua lệnh đã kết thúc nên không đổi trạng thái robot, không đụng traffic, không ảnh hưởng Job. Lệnh về bãi không có `JobStepId`, nên handler của Job cũng bỏ qua.
- Robot offline khi đang về bãi: monitor có sẵn ABORT lệnh → lượt settle tiếp theo đóng intent FAILED (`ROBOT_OFFLINE`) và giải phóng bãi. Robot offline khi Job đang chờ: không gửi được CANCEL → Job chờ tới timeout → OnFailure.

### Bật

Mặc định **tắt** (`FleetIdle:AutoReturnToPark=false`) vì RBT-001 không có E-stop phần cứng. Muốn bật: đặt `FleetIdle__AutoReturnToPark=true` và `FleetIdle__IdleSeconds` (mặc định 300). Cần áp migration `AddRobotPositioningIntents` (nhánh park và nhánh này; DB dev hiện ở schema `develop` nên **chưa có bảng này**).

## 7. Bằng chứng test

Tất cả chạy trên `warotrans_test` / `warotrans_operations_test`, MQTT là publisher giả (`CapturingMqttRobotCommandPublisher`).

| Nhánh | Bộ test | Kết quả |
|---|---|---|
| `feature/outbound-relocation-workflows` | UnitTests (toàn bộ) | 744 passed, 3 skipped, 0 failed |
| | IntegrationTests (toàn bộ) | 327 passed, 2 skipped, 0 failed |
| `feature/auto-park-positioning-intent` | UnitTests (toàn bộ) | 834 passed, 3 skipped, 0 failed |
| | IntegrationTests (toàn bộ) | 374 passed, 2 skipped, 0 failed |

Ở lượt chạy toàn bộ đầu tiên của nhánh auto-park, có 2 lỗi:

- `Idle_robots_stay_put…`: test cũ giả định auto-park là Job. Đã cập nhật để kiểm rằng giờ là intent và không tạo Job.
- `RobotControlEndpointTests.Only_one_person_drives…` (teleop): lỗi một lần, chạy riêng đạt 2/2 và đạt trong lượt toàn bộ thứ hai. Test này không đi qua code positioning.

Test mới:

- `StandardWorkflowSeedTests` (6): publish cả hai và chạy lại không đổi gì; chỉ MOVE/HUMAN với binding đúng; định nghĩa đổi → version mới và bản cũ không bị sửa; DRAFT còn sót → hoàn tất và publish; grouping nhiều container (×2 workflow).
- `StandardWorkflowRequestRulesTests` (8, qua API): OUTBOUND 2 kệ → 1 Job, 1 điểm dropoff; RELOCATION hợp lệ; 6 ca bị từ chối và không lưu gì.
- `RobotPositioningTests` (9): claim và NAVIGATE không thuộc Job; **đua đồng thời** 2 robot 1 bãi → 1 thắng; dispatch vẫn chọn robot đang về bãi; yield CANCEL một lần → chờ → bàn giao; **kết quả MQTT muộn** không đổi robot hay intent; **pose cũ** → chưa bàn giao; settle ARRIVED và **offline** FAILED; auto-return chỉ chọn bãi trống, bỏ robot offline, không tạo Job/JobContainer; MOVE của Job bị giữ tới khi bàn giao xong.
- `DispatchEligibilityTests` (+3): robot về bãi được chọn, robot bận khác thì không; về bãi không miễn các lý do khác.

**Chưa có bằng chứng:**

- Nhánh Semantic reconcile thành công (với policy đã bind) và lỗi `RECONCILE_CONFLICT` mới chỉ đi qua code ở chế độ Active của test (kết quả `NO_GRAPH` được coi là không có gì để reconcile) và qua ca pose cũ.
- Timeout 60 s của MOVE không có test riêng.
- Trong test, sau bàn giao MOVE dừng ở bước định tuyến vì bản đồ test không có traffic graph. Test chỉ khẳng định MOVE đã ra khỏi cổng chờ và không bị lỗi do positioning; việc gửi NAVIGATE của MOVE là phần có sẵn.
- Chưa chạy trên robot thật: **không PHYSICAL PASS**.

## 8. File thay đổi

`feature/outbound-relocation-workflows`:

- `backend/src/Modules/WorkflowExecution/Seeding/StandardWorkflowSeeder.cs` (mới), đăng ký DI trong `WorkflowExecutionModule.cs`
- `backend/src/Modules/WorkflowExecution/Services/WorkflowMovementRules.cs` (mới), `WorkflowRequestValidator.cs`
- `backend/src/Modules/Transportation/Features/CreateTransportRequest/Handler.cs`
- `backend/tools/WorkflowSeed/` (mới)
- `samples/workflows/WaroTrans_OUTBOUND_INTERNAL_RELOCATION_Seed_Blueprint.json`
- test: `WorkflowExecution/StandardWorkflows/StandardWorkflowSeedTests.cs`, `Transportation/CreateTransportRequest/StandardWorkflowRequestRulesTests.cs`

`feature/auto-park-positioning-intent`:

- Fleet: `Entities/RobotPositioningIntent.cs`, `Enums/PositioningIntentStatus.cs`, `Features/Positioning/RobotPositioningService.cs`, `Persistence/Configurations/RobotPositioningIntentConfiguration.cs`, migration `20261110090954_AddRobotPositioningIntents`, `FleetDbContext`, `FleetModule`, `Contracts/IFleetModule.cs` (+`PositioningYield`), `Services/FleetModuleApi.cs`, `Features/Dispatch/DispatchEligibility.cs`, `DispatchService.cs`
- WorkflowExecution: `Execution/JobExecutionEngine.cs` (nhận robot đang về bãi, cổng MOVE, đánh thức MOVE chờ), `Features/RobotCare/RobotCareService.cs` (auto-return qua intent, bỏ bãi đã có intent)
- test: `Fleet/Positioning/RobotPositioningTests.cs`, `DispatchEligibilityTests.cs`, `JobExecutionEngineTests.cs`

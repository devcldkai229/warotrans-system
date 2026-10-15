# GĐ 3 — Bộ máy chạy Job: robot ảo chạy trọn một TransportRequest

> Trạng thái: **XONG** (2026-10-15), nhánh `feature/simulation-robot-workflow`.
> Kết quả: `REQ-20261015-000001` (3 container) → `JOB-20261015-000001` chạy **19/19 bước trong 126 s** trên robot ảo
> trong Gazebo. Job `COMPLETED`, TransportRequest `COMPLETED`, 3 Detail `COMPLETED`.
> Trước đó: [GĐ 2](02-backend-nhan-robot-ao.md) (backend ra từng lệnh MOVE bằng tay).

## 1. GĐ 3 thêm gì vào hệ thống

Trước GĐ 3, `POST /transport-requests/{id}/queue` đã sinh được **Job runtime graph** (Job → JobTask → JobStep), nhưng
không có gì *chạy* graph đó. GĐ 3 thêm **`JobExecutionEngine`** (module WorkflowExecution): nó đi lần lượt từng JobStep
và làm đúng việc của từng loại step.

```
                          ┌──────────────────────── WorkflowExecution ────────────────────────┐
 Staff/Script             │                                                                   │
  POST /jobs/{id}/start ─►│ JobExecutionEngine.StartAsync  ── gán robot (assignedRobotId)     │
                          │        │                                                          │
                          │        ▼ AdvanceAsync: chạy step theo thứ tự tới khi phải chờ      │
                          │   CHECK ─────────► IFleetModule / INavigationModule /             │
                          │                    ITransportRequestActivityQuery (Transportation)│
                          │   MOVE  ─────────► IFleetModule.NavigateAsync(jobStepId) ──► MQTT ─┼─► robot ảo (Gazebo)
                          │   HUMAN_INTERACTION → WAITING (chờ Staff)                          │
                          │        ▲                                   ▲                       │
 RobotCommandLifecycle ───┼────────┘ (RESULT → step COMPLETED → Advance)│                      │
  (Fleet, từ MQTT)        │                                            │                       │
 POST /job-steps/{id}/confirm ─► ConfirmHumanStepAsync ─────────────────┘                      │
                          │        └─ HandoverConfirmation, JobContainer ONBOARD / DELIVERED    │
                          │        └─ event JobContainerStatusChanged ──────────────────────────┼─► Transportation:
                          └───────────────────────────────────────────────────────────────────┘    Detail + Request status
```

Engine **chạy theo sự kiện**, không có vòng lặp chạy ngầm. Nó chạy hết các step làm được ngay (CHECK), dừng ở step phải
chờ (MOVE chờ robot, HUMAN chờ người), và được đánh thức lại bởi:
- **kết quả lệnh robot**: `RobotCommandLifecycleChanged` → `RobotCommandLifecycleJobStepHandler` → `AdvanceAsync`;
- **nhân viên xác nhận**: `POST /job-steps/{id}/confirm` → `ConfirmHumanStepAsync` → `AdvanceAsync`.

## 2. Từng loại step được xử lý thế nào

Trước khi chạy, mỗi step được resolve input bằng `StepInputResolver` (đã có từ trước) từ 3 nguồn:
`Job.ContextValues` (biến workflow + `assignedRobotId` + `jobId`), `JobTask.ContextValues` (CURRENT_MOVEMENT của
stop/container) và output của các step trước. Kết quả lưu ở `JobStep.ResolvedInputs`.

| Step | Engine làm gì | Hoàn thành khi | Output (`OutputValues`) |
|---|---|---|---|
| `CHECK.ROBOT_READY` | Đọc robot qua `IFleetModule`: enabled, online, `LOCALIZED`, status AVAILABLE/RESERVED/EXECUTING | ngay | `passed`, `robotStatus`, `reason`, `checkedAt` |
| `CHECK.BATTERY_MIN` | `robot.BatteryPercent ≥ minimumBatteryPercent` (ADMIN_INPUT = 25) | ngay | `actualBatteryPercent`, `requiredBatteryPercent`, … |
| `CHECK.REQUEST_ACTIVE` | Hỏi Transportation qua `ITransportRequestActivityQuery`: request chưa CANCELLED/REJECTED/FAILED/COMPLETED | ngay | `requestStatus`, … |
| `CHECK.ENDPOINT_AVAILABLE` | Endpoint tồn tại, đang bật, đúng map của Job (`INavigationModule`) | ngay | `endpointStatus`, … |
| `MOVE.PICKUP / DROPOFF` | Lấy pose endpoint → `IFleetModule.NavigateAsync(robot, x, y, yaw, jobId, jobStepId)` → step `EXECUTING` | robot gửi RESULT | `navigationResult`, `arrivedEndpointId`, `startedAt`, `completedAt`, `robotCommandId` |
| `HUMAN_INTERACTION.PICKUP_CONFIRM / DROPOFF_CONFIRM` | step `WAITING` | Staff gọi confirm với **đúng container** | `confirmed`, `confirmedBy`, `confirmedAt`, `note` |
| `WAIT`, `CHECK.LOAD_STATE / INVENTORY_AVAILABLE` | chưa hỗ trợ ở V1 → step FAILED | — | — |

**Một step lỗi** thì engine áp `OnFailure` của WorkflowStep: `FAIL_JOB` → Job `FAILED` (container chưa giao → `FAILED`),
`PAUSE_FOR_OPERATOR` → Job `PAUSED`, `REQUEST_REASSIGN` → Job `REASSIGNING`. V1 **chưa có** API resume / tự gán robot
khác, nên Job dừng ở trạng thái đó.

## 3. Trạng thái thay đổi theo thời gian (luồng thật đã chạy)

Request: `C1 A→D`, `C2 A→E`, `C3 B→F`. Planner (GĐ 3 cũ) ra stops `A [C1,C2] → B [C3] → D [C1] → E [C2] → F [C3]`,
nên Job có 12 JobTask / 19 JobStep.

| Thời điểm | Step | Robot (Gazebo) | JobContainer → Detail | Request |
|---|---|---|---|---|
| start | CHECK_READY, CHECK_BATTERY (87% ≥ 25%), CHECK_REQUEST, CHECK_SOURCE_ENDPOINT A ✔ | — | 3 × `ASSIGNED` → `IN_PROGRESS` | `IN_PROGRESS` |
| 0–25 s | MOVE_PICKUP A `EXECUTING` | (6.0,0.8) → (1.8,6.2) | | |
| 25 s | PICKUP_CONFIRM C1 `WAITING` → Staff confirm | đứng ở A | C1 `ONBOARD` | |
| 29 s | PICKUP_CONFIRM C2 → confirm | | C2 `ONBOARD` | |
| 33–47 s | CHECK_SOURCE_ENDPOINT B, MOVE_PICKUP B | → (1.75,4.16) | | |
| 47 s | PICKUP_CONFIRM C3 → confirm | đứng ở B | C3 `ONBOARD` | |
| 52–86 s | CHECK_DEST_ENDPOINT D, MOVE_DROPOFF D | → (10.17,6.20) | | |
| 86 s | DROPOFF_CONFIRM C1 → confirm | | C1 `DELIVERED` → Detail `COMPLETED` | `PARTIALLY_COMPLETED` |
| 90–106 s | MOVE_DROPOFF E, DROPOFF_CONFIRM C2 | → (10.22,4.16) | C2 `DELIVERED` | |
| 110–122 s | MOVE_DROPOFF F, DROPOFF_CONFIRM C3 | → (10.22,1.79) | C3 `DELIVERED` | **`COMPLETED`** |
| 126 s | — | | | Job **`COMPLETED`** 19/19 |

Log đầy đủ (pose robot mỗi giây): `samples/simulation/responses/13-job.run.log.txt`.

## 4. API mới (module WorkflowExecution, quyền Staff/Admin)

| API | Làm gì |
|---|---|
| `POST /api/workflow-execution/jobs/{id}/start` `{ "robotId": "…" }` | Gán robot (hoặc tự chọn robot AVAILABLE tốt nhất trên map của Job, chưa chạy Job khác) và bắt đầu chạy |
| `GET /api/workflow-execution/jobs?status=&transportRequestId=&take=` | Danh sách Job + tiến độ `completedSteps/totalSteps` |
| `GET /api/workflow-execution/jobs/{id}` | Chi tiết: tasks (scope, stop, container), steps (status, resolvedInputs, outputValues, lỗi), containers, `currentStepId` |
| `POST /api/workflow-execution/job-steps/{id}/confirm` `{ "containerId": "…", "note": "…" }` | Staff xác nhận bước PICKUP/DROPOFF. Container phải đúng container của step, nếu sai thì 400 `handover_container_mismatch` |

`JobBatchPlan` vẫn **không** lộ ra API (đúng rule).

## 5. Ranh giới module (không truy cập DB của module khác)

| Cần | Cách | Vì sao |
|---|---|---|
| WorkflowExecution → robot | **`IFleetModule`** (mới, Fleet/Contracts): `GetRobotAsync`, `GetDispatchCandidatesAsync`, `NavigateAsync` (dùng lại `IssueNavigateCommandHandler`) | WorkflowExecution tham chiếu Fleet chỉ để dùng Contracts |
| WorkflowExecution → toạ độ endpoint | `INavigationModule.GetEndpointPoseAsync` (mới) | |
| WorkflowExecution → trạng thái request | **`ITransportRequestActivityQuery`**: interface khai báo ở WorkflowExecution, Transportation implement | Transportation đã phụ thuộc WorkflowExecution, nên chiều ngược lại phải đảo phụ thuộc (DI) |
| WorkflowExecution → Transportation (tiến độ) | integration event **`JobContainerStatusChanged`** → `JobContainerStatusChangedHandler` | ASSIGNED/ONBOARD → Detail `IN_PROGRESS`, DELIVERED → `COMPLETED`, FAILED → `FAILED`; Request tổng hợp theo rules/02 |
| Realtime (GĐ 4) | event `JobStatusChanged`, `JobStepStatusChanged` đã phát, chưa có ai nghe | GĐ 4 nối vào SignalR |

**Robot thuộc Job nào:** Fleet hiện tạo một `JobAssignment` cho *mỗi lệnh* navigate và kết thúc nó khi lệnh xong (robot
về `AVAILABLE` giữa các bước). Engine giữ quan hệ "Job ↔ robot" ở `Job.ContextValues.assignedRobotId`, và khi start
không cho một robot nhận 2 Job đang chạy. Vì vậy không phải đổi vòng đời assignment của Fleet.

## 6. Thay đổi phía robot ảo

Gateway (`warotrans_fleet`) thêm tham số `simulated_battery_percent` (mặc định `-1` = gửi `null` như robot thật).
`robot_gateway_sim.yaml` đặt `87.0`. Nhờ vậy bước `CHECK_BATTERY` có số liệu để kiểm. Backend **không** nới luật:
robot thật chưa có cảm biến pin thì bước này vẫn FAILED, đúng sự thật.

## 7. Cách chạy

```powershell
cd infrastructure; docker compose up -d; cd ..
powershell -ExecutionPolicy Bypass -File samples/simulation/run-backend-sim.ps1          # terminal 1
powershell -ExecutionPolicy Bypass -File samples/simulation/seed-sim.ps1                 # một lần
wsl -d Ubuntu-24.04 -- bash /mnt/d/WaroTransSim/scripts/run-sim.sh   # terminal 2 (bỏ gui:=false để thấy Gazebo)
powershell -ExecutionPolicy Bypass -File samples/simulation/run-job-sim.ps1              # tạo request → queue → start → theo dõi + xác nhận
powershell -ExecutionPolicy Bypass -File samples/simulation/run-job-sim.ps1 -ManualConfirm   # bạn tự gọi confirm
```

## 8. Kiểm thử

| Bộ test | Kết quả |
|---|---|
| Unit (295), có thêm `JobExecutionEngineTests` (9) và `TransportRequestProgressTests` (7) | pass |
| Architecture (11) | pass |
| Integration (102, DB riêng `warotrans_it`) | 98 pass, 4 skip (skip sẵn trong repo) |
| Gateway Python (50) | pass (khi không có sim khác chạy cùng ROS domain) |
| E2E thật: robot ảo + backend (`run-job-sim.ps1`) | Job `COMPLETED` 19/19 trong 126 s, Request `COMPLETED` |

`JobExecutionEngineTests` kiểm:
- chạy trọn Job (3 MOVE, 4 confirm, 4 `HandoverConfirmation`, container `ASSIGNED → ONBOARD → DELIVERED`);
- xác nhận nhầm container;
- xác nhận step chưa chờ;
- pin thấp → Job FAILED;
- request bị huỷ;
- điều hướng thất bại;
- không có robot rảnh;
- robot khác map.

## 9. Giới hạn đã biết (V1)

- Chưa có resume / retry cho Job `PAUSED` / `REASSIGNING`, chưa tự gán robot khác (REQUEST_REASSIGN chỉ đổi trạng thái).
- `WAIT`, `LOAD_STATE`, `INVENTORY_AVAILABLE` chưa thực thi.
- Không có khoá lạc quan trên Job: engine dựa vào việc các sự kiện của một Job đến tuần tự (robot chỉ chạy 1 lệnh/lúc).
- Start Job là thủ công (API). Chưa tự dispatch Job mới tạo.
- Các ghi chú từ GĐ 2 (concurrency exception khi lệnh timeout, IPv6 `localhost`) vẫn còn.

## 10. Tiếp theo — GĐ 4

Web admin: trang theo dõi giống video, gồm map + endpoint + icon robot theo `robotTelemetryUpdated`, panel các step với
`currentStepId` / % tiến độ, và nút **Xác nhận** gọi `POST /job-steps/{id}/confirm`. Backend chỉ cần nối
`JobStatusChanged` / `JobStepStatusChanged` vào SignalR.

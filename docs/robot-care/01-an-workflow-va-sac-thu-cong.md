# Ẩn workflow nội bộ khỏi staff, và sạc pin thủ công

Ngày: 2026-11-24.

## 1. Vấn đề

1. **Staff thấy mọi workflow.** Cả 3 vai trò đều có quyền `workflow.read`, và API không lọc theo vai trò. Vì vậy staff thấy cả `ROBOT_CHARGING` (đi sạc) và `ROBOT_RETURN_TO_PARK` (về bãi đỗ):
   - ở trang Workflows;
   - ở ô chọn workflow khi tạo yêu cầu vận chuyển;
   - trong danh sách Job;
   - trong danh sách việc cần làm, khi bước "xác nhận cắm sạc" xuất hiện.
2. **Robot đi sạc vẫn hiện "Available".**
   - `RobotStatus.CHARGING` có trong code nhưng không chỗ nào gán nó.
   - Workflow sạc chỉ "đi tới trạm sạc", rồi chờ người xác nhận đã cắm. Lệnh MOVE xong thì robot về AVAILABLE, nên hệ thống có thể giao việc cho robot đang nằm sạc.
   - Robot thật chỉ đo pin bằng điện áp, nên luôn báo `batteryChargingState = UNKNOWN`.
3. **Sạc ở đây là cắm và rút bằng tay.** Dù pin đầy hay trên 50%, vẫn cần người tới rút sạc.

## 2. Phần A: workflow chỉ dành cho admin và kỹ thuật viên

### Dữ liệu

- `execution.workflows.staff_visible` có kiểu bool, mặc định `true`.
- Đây là **cài đặt của cả mã workflow**: mọi version mang cùng giá trị.
  - Admin đổi được bất cứ lúc nào, kể cả khi workflow đã publish.
  - Không cần tạo version mới.
  - Version mới chép giá trị từ version trước.
- Migration `WorkflowStaffVisible` đặt `false` cho `ROBOT_CHARGING` và `ROBOT_RETURN_TO_PARK`.
- File seed `backend/seed/workflows/ROBOT_*.json` có thêm `"staffVisible": false`.

### Lọc theo vai trò

`StaffWorkflowVisibility` chỉ lọc STAFF. ADMIN và TECHNICIAN thấy tất cả. Tác vụ chạy nền (không có tài khoản) không bị lọc.

| Chỗ | Staff gặp workflow hoặc Job bị ẩn |
|---|---|
| `GET /workflows` | Không có trong danh sách |
| `GET /workflows/{id}`, `…/request-input-schema` | **404** `workflow_not_found` (không tiết lộ là có tồn tại) |
| Tạo yêu cầu vận chuyển (`WorkflowRequestValidator`) | Từ chối `workflow_not_available`, kể cả khi gọi API trực tiếp |
| `GET /jobs`, `GET /jobs/{id}` | Không có trong danh sách / 404 `job_not_found` |
| `GET /human-tasks` (việc cần làm) | Không có bước của Job bị ẩn |
| Thông báo "Job chờ người", "bước quá hạn", "việc bị nhả", "Job cần khôi phục" | Gửi cho **Admin**, không gửi cho staff |

`PUT /workflows/{id}/staff-visibility { staffVisible }`:
- cần quyền `workflow.write` (chỉ admin);
- đổi cho mọi version cùng mã;
- ghi audit `workflow.staff_visibility_changed`.

### Giao diện web

- Trình sửa workflow: công tắc **"Staff được thấy"** cạnh trạng thái. Người không có quyền sửa chỉ thấy nhãn.
- Danh sách Workflows: workflow bị ẩn có nhãn **"Chỉ admin / kỹ thuật"**.
- App điện thoại tự đúng nhờ backend đã lọc. Staff dùng app để tạo yêu cầu và xử lý việc.

## 3. Phần B: sạc thủ công

### Luồng

```
AVAILABLE
  → "Đi sạc" (Job ROBOT_CHARGING): robot chạy tới trạm sạc        [EXECUTING]
  → tới nơi: Job chờ bước "đã cắm sạc"; web hiện "Chờ cắm sạc"      [Job giữ robot, không giao việc khác]
  → Admin/Technician bấm "Đã cắm sạc" → bước xong, Job COMPLETED    [CHARGING]
  → pin ≥ Fleet:Battery:ChargeFullPercent (90%)
      → thông báo "Robot RBT-001 đã đầy pin, hãy rút sạc" (Admin + Technician phụ trách), 1 lần
  → sau Fleet:Battery:UnplugReminderMinutes (30 phút) chưa ai rút
      → nhắc "Robot RBT-001 vẫn đang cắm sạc", 1 lần
  → người rút sạc, bấm "Đã rút sạc"                                  [AVAILABLE]
      → các thông báo sạc được đánh dấu đã xử lý
```

**Không có gì tự kết thúc sạc:**
- Một lệnh chạy xong (`MarkAvailable`) không đưa robot ra khỏi CHARGING.
- Pin đầy cũng không. Pin đầy chỉ tạo thông báo.

### Quy tắc

- **"Đã cắm sạc"** (`POST /api/workflow-execution/robots/{id}/charging/plugged-in`):
  - nếu Job sạc của robot đang chờ đúng bước này thì xác nhận bước đó, Job hoàn tất;
  - nếu không có Job nào chờ (cắm tay ngoài Job) thì robot chuyển thẳng sang CHARGING;
  - robot đang chạy lệnh thì bị từ chối với `robot_busy`.
- **"Đã rút sạc"** (`POST …/charging/unplugged { force }`):
  - pin dưới ngưỡng đầy thì trả 409 `charge_not_full`;
  - web và app hỏi lại "Pin mới X%, vẫn kết thúc sạc?", người dùng đồng ý thì gửi lại với `force: true`;
  - mỗi lần bấm ghi audit `robot.charging_started` / `robot.charging_ended` và ghi vào nhật ký trạng thái robot.
- **Quyền:** hai nút cần `robot.command` (Admin, Technician), kèm phạm vi robot (Technician chỉ với robot được giao). Staff nhận 403.
- **Robot CHARGING không được giao việc:** bộ chọn robot và "robot rảnh tự về bãi" chỉ lấy robot AVAILABLE.
- **Telemetry ghi đồng thời:**
  - Bước phát hiện "đầy pin" dùng một lệnh ghi có điều kiện (`charge_full_at IS NULL`), nên chỉ báo 1 lần dù nhiều bản tin telemetry đến cùng lúc.
  - Cắm và rút sạc tự đọc lại rồi thử lưu lại khi gặp xung đột (`DbUpdateConcurrencyException`), giống `PutRobotInService`.
- **Chừa sẵn cho phần cứng:** nếu sau này robot báo `batteryChargingState = FULL` (cảm biến dòng, BMS), backend coi đó là đầy pin và gửi thông báo. Bước rút sạc vẫn do người xác nhận.

### Dữ liệu

- `fleet.robots` có thêm 3 cột:
  - `charging_since`: thời điểm cắm sạc;
  - `charge_full_at`: lần đầu thấy đầy pin, cũng là lúc đã gửi thông báo;
  - `charge_reminder_at`: lúc đã gửi lời nhắc.

  Migration là `RobotManualCharging`.
- Cấu hình nằm trong `Fleet:Battery`: `ChargeFullPercent` (mặc định 90) và `UnplugReminderMinutes` (mặc định 30).
- `ChargeReminderHostedService` quét mỗi 60 giây.

### Giao diện

- **Web, thẻ "Điều khiển" của robot:**
  - nút "Đã cắm sạc";
  - khung vàng "Chờ cắm sạc" khi Job sạc đang chờ ở trạm;
  - khung "Đang sạc" ghi giờ cắm và % pin, kèm nhãn "Đã đầy: hãy rút sạc" và nút "Đã rút sạc".
- **App:** popup robot trên bản đồ có "Đã cắm sạc" / "Đã rút sạc". Nút chỉ hiện với Admin và Technician.
- **Thông báo:** câu tiếng Việt cho `ROBOT_CHARGE_FULL` và `ROBOT_CHARGER_STILL_PLUGGED`, trên cả web lẫn app.

## 4. Các file chính

| File | Nội dung |
|---|---|
| `WorkflowExecution/Entities/Workflow.cs`, `Persistence/Migrations/*WorkflowStaffVisible*` | Cờ `StaffVisible` |
| `WorkflowExecution/Features/WorkflowVisibility/StaffWorkflowVisibility.cs` | Bộ lọc staff, `PUT …/staff-visibility`, `JobStaffVisibility` |
| `ListWorkflows`, `GetWorkflow`, `GetWorkflowRequestInputSchema`, `Services/WorkflowRequestValidator.cs`, `Features/Shared/JobDtos.cs`, `Features/HumanTasks/Endpoints.cs` | Áp bộ lọc |
| `Fleet/Entities/Robot.cs` | `StartCharging`, `EndCharging`; `MarkAvailable` không đưa robot ra khỏi CHARGING |
| `Fleet/Features/Charging/RobotChargingService.cs` | Cắm, rút, phát hiện đầy pin, nhắc, thử lại khi xung đột |
| `Fleet/Features/ProcessRobotTelemetry/ProcessRobotTelemetryHandler.cs` | Gọi bước phát hiện đầy pin |
| `Fleet/IntegrationEvents/RobotAlertEvents.cs` | `RobotChargingStarted`, `RobotChargeFull`, `RobotChargingEnded` |
| `WorkflowExecution/Execution/JobExecutionEngine.cs` | Bước `CHARGE_CONNECT_CONFIRM` xong thì robot chuyển CHARGING |
| `WorkflowExecution/Features/RobotCare/*` | Các API `charging`, `plugged-in`, `unplugged` |
| `WaroTrans.Host/Realtime/AdminNotificationProducer.cs` | Thông báo đầy pin / nhắc rút sạc; thông báo của Job bị ẩn chỉ gửi Admin |
| Web: `RobotControlCard.tsx`, `StaffVisibilityToggle.tsx`, `workflows-list-page.tsx`, `workflow-editor-page.tsx` | Giao diện |
| App: `shared/maps/RobotChargingPanel.tsx`, `MapViewport.tsx` | Giao diện |

# Báo cáo test: ẩn workflow khỏi staff và sạc thủ công (2026-11-24)

## 1. Test tự động

| Phần | Kết quả |
|---|---|
| Backend unit | 1185 passed, 3 skipped |
| Backend architecture | 16 passed |
| Web (`tsc -b`, `oxlint`, `vitest run`) | Sạch, 299 passed |
| App (`tsc --noEmit`, `node --test`) | Sạch, 269 passed |

Có 12 test mới:

- `WorkflowExecution/Features/StaffWorkflowVisibilityTests.cs`:
  - staff không thấy workflow bị ẩn, admin và kỹ thuật viên thấy;
  - staff mở workflow bị ẩn thì nhận 404;
  - staff chỉ thấy Job của workflow hiện cho staff;
  - ẩn một workflow thì ẩn mọi version cùng mã, và chỉ ghi audit một lần.
- `Fleet/RobotChargingTests.cs`:
  - robot đã cắm sạc vẫn là CHARGING kể cả khi một lệnh chạy xong;
  - rút sạc thì về AVAILABLE và xoá dữ liệu sạc;
  - robot đang chạy không cắm sạc được;
  - robot không đang sạc thì không rút sạc được;
  - cắm sạc lần hai giữ nguyên thời điểm cắm đầu;
  - "đầy" nghĩa là pin đã đo và ≥ ngưỡng; pin chưa đo không tính là đầy.

Integration test chưa chạy, vì chúng xoá DB test.

## 2. Thử trên DB dev và Gazebo (RBT-001, map MAP-ONE-V019)

Trước khi chạy migration, DB dev đã được backup vào `infrastructure/snapshots/warotrans_postgres_before_staff_visible_charging_20261124.dump`.

### Phần A: lọc theo vai trò (tài khoản admin / staff / technician)

| Kiểm tra | Admin | Technician | Staff |
|---|---|---|---|
| `GET /workflows` | 5 workflow | 5 workflow | 3 workflow (không có ROBOT_CHARGING, ROBOT_RETURN_TO_PARK) |
| `GET /workflows/{ROBOT_CHARGING}` và `…/request-input-schema` | 200 | 200 | **404** |
| `GET /jobs` | 13 Job | 13 Job | 9 Job (ẩn 4 Job chăm sóc robot) |
| `GET /jobs/{Job sạc}` | 200 | | **404** |
| Việc cần làm khi Job sạc chờ "đã cắm sạc" | | | Không thấy |
| `PUT …/staff-visibility`, `plugged-in`, `unplugged` | | | **403** |

### Phần B: sạc

Để không phải chờ pin sim tăng (pin sim cố định ở 87%), backend chạy với ngưỡng thử: lần đầu `ChargeFullPercent=95`, sau đó `85`, kèm `UnplugReminderMinutes=1`. Sau khi thử xong, backend chạy lại với giá trị mặc định 90% và 30 phút.

| Bước | Kết quả |
|---|---|
| Robot đứng lệch bãi đỗ nên bị từ chối với `robot_not_at_home`; đưa về Parking A trong Gazebo rồi định vị lại | Robot ở (−0.52, −1.48), LOCALIZED |
| Admin "Đi sạc" | Job J241126005: MOVE tới EP-CHARGE (EXECUTING), khoảng 12 giây sau dừng ở bước CONNECT_CONFIRM (WAITING) |
| Technician chưa được giao RBT-001 bấm "Đã cắm sạc" | 403 `robot_out_of_scope` |
| Giao RBT-001 cho technician, rồi bấm "Đã cắm sạc" | Robot **CHARGING**, Job **COMPLETED** |
| "Đã rút sạc" khi pin 87%, ngưỡng 95% | 409 `charge_not_full` |
| "Đã rút sạc" với `force` | AVAILABLE |
| Cắm tay không qua Job | CHARGING |
| Khởi động lại với ngưỡng 85% | Telemetry kế tiếp: `chargeFullAt` được ghi, có **1** thông báo `ROBOT_CHARGE_FULL` cho admin và technician, staff không nhận |
| Sau 1 phút | **1** lời nhắc `ROBOT_CHARGER_STILL_PLUGGED` |
| "Đã rút sạc" khi đã đầy | AVAILABLE; cả hai thông báo sạc được đánh dấu đã xử lý; bấm lần nữa thì nhận 409 `robot_not_charging` |
| 5 vòng cắm và rút liên tiếp trong lúc telemetry vẫn ghi | Đều 200, không còn `DbUpdateConcurrencyException` |
| Dọn dẹp | RBT-001 tự về Parking A (Job J241126006); phạm vi robot của technician trả lại như cũ (rỗng) |

**Lỗi tìm thấy khi thử và đã sửa:**
- Lần đầu, rút sạc trả về 500 với `DbUpdateConcurrencyException`. Nguyên nhân: telemetry cập nhật hàng robot vài lần mỗi giây, trong khi `UpdatedAt` là concurrency token.
- Đã sửa bằng cách đọc lại và thử lưu lại tối đa 5 lần, giống `PutRobotInService`.

## 3. Giao diện

Ảnh trong `test-20261124/`:
- `1-robot-dang-sac.png`: thẻ "Điều khiển" của RBT-001 có khung "Đang sạc", giờ cắm, pin 87%, nhãn "Đã đầy: hãy rút sạc" và nút "Đã rút sạc".
- `2-thong-bao-day-pin.png`: chuông thông báo hiện "Robot RBT-001 đã đầy pin, hãy rút sạc" và "Robot RBT-001 vẫn đang cắm sạc".
- `3-workflows-admin.png`: danh sách Workflows của admin; ROBOT_CHARGING và ROBOT_RETURN_TO_PARK có nhãn "Chỉ admin / kỹ thuật".
- `4-cong-tac-staff.png`: trình sửa workflow có công tắc "Staff được thấy", đang tắt với ROBOT_CHARGING.

Staff không vào được web console vì không có quyền `ConsoleAccess`. Phần của staff được kiểm tra qua API, chính là API mà app dùng.

## 4. Chưa thử

- Bản build mới của app trên điện thoại thật (Expo). Đã qua typecheck và test.
- Pin tăng thật trên robot thật: pin trong sim là giá trị cố định.

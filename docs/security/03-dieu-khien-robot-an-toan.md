# Điều khiển robot an toàn: dừng, tạm dừng Job, lái tay, bảo trì, nguồn, chẩn đoán (Phase 3)

> Task: **RB-03, WFX-03, RB-04, RB-08, RB-09, RB-10** · Owner: Nguyễn Trung Nguyên
> Nhánh: `warotrans-system` → `feature/nguyen-p3-robot-control` · robot → `feature/robot-stop-teleop-diag`
> Contract MQTT: [`docs/mqtt-robot-contracts.md`](../mqtt-robot-contracts.md) (STOP/RESUME, SYSTEM_ACTION, Health)

## 1. Vấn đề trước khi làm

- **Không có lệnh dừng thật:** robot chỉ có `CANCEL` cho goal đang chạy. Lệnh này không "giữ" robot đứng yên; ngay sau đó vẫn có thể gửi goal mới hoặc lái tay.
- **Nút trên web là giả:** nút "Pause" và "Unavailable" bấm không làm gì.
- **Không có Pause Job thủ công:** chỉ có pause tự động khi một step lỗi.
- **Teleop không có quyền độc quyền:** hai người có thể lái cùng một robot cùng lúc.
- **Bảo trì, nguồn, chẩn đoán:**
  - `MAINTENANCE` có trong enum nhưng không chỗ nào gán.
  - Không có reboot hay shutdown.
  - Không có health: README nhắc tới một `diagnostics_node.py` nhưng file này không tồn tại.

## 2. STOP / PAUSE / RESUME (RB-03)

```
Web/App "Stop" ─► POST /robots/{id}/commands/stop (robot.stop) ─► RobotCommand STOP ─► MQTT command
                                                                   │
Robot: ACK ─► huỷ goal đang chạy (goal đó tự báo CANCELED) ─► GIỮ mọi chuyển động
       ├─ phát Twist 0 lên topic hold, ép authority_ok=false (cmd_vel_authority_gate xuất 0)
       ├─ NAVIGATE → ACK từ chối MOTION_HELD; teleop bị bỏ
       ├─ telemetry motionHold=true
       └─ RESULT SUCCEEDED khi odom cho thấy |v|≤0.02, |ω|≤0.05 liên tục 0.5 s
          (hết 5 s mà không xác minh được → FAILED STOP_UNVERIFIED, VẪN giữ)
Backend: GET /robots/{id}/stop-state → REQUESTED → ACCEPTED → STOPPED_VERIFIED | REJECTED | UNKNOWN
```

- **Không bao giờ báo "đã dừng" khi chưa có xác nhận.**
  - Trạng thái `STOPPED_VERIFIED` chỉ có khi robot trả RESULT SUCCEEDED.
  - Robot mất kết nối, không gửi ACK, hoặc không xác minh được thì trạng thái là `UNKNOWN`.
  - Robot đang offline mà gọi STOP thì backend trả `409 robot_offline`, kèm hướng dẫn dùng E-stop vật lý.
- **Quyền:** STOP cần `robot.stop` (Staff, Technician, Admin). RESUME cần `robot.configure` (Technician, Admin), nên Staff dừng được robot nhưng không tự cho nó chạy lại.
- **Nơi lưu trạng thái giữ:** `Robot.MotionHeld` lấy từ telemetry (`motionHold`), vì robot là nguồn sự thật.
  - RESUME đặt trước giá trị `false` ngay khi gửi lệnh. Nếu robot từ chối, telemetry sẽ đặt lại `true`.
- **Robot đang bị giữ:**
  - không được dispatch (`DispatchRobotSelector`, `EnsureRobotCanTakeJob`);
  - không nhận NAVIGATE (`robot_motion_held`);
  - không cho teleop (`robot_motion_held`).
- **Phía robot** nằm ở [`motion_hold.py`](https://github.com/devcldkai229/warotrans/blob/feature/robot-stop-teleop-diag/ros2_ws/src/warotrans_fleet/warotrans_fleet/motion_hold.py), Python thuần nên test được không cần ROS:
  - `MotionHold` giữ trạng thái;
  - `StopCommandHandler` và `ResumeCommandHandler` xử lý lệnh;
  - `HoldGuard` bọc handler NAVIGATE để chặn khi đang giữ.

  Gateway gắn thêm phần ROS: lấy tốc độ từ `/odom`, phát lệnh dừng trên `hold_cmd_vel_topic` (mặc định `cmd_vel_topic`), và AND `authority_ok` với "không bị giữ".

## 3. Tạm dừng Job thủ công (WFX-03)

- **Gọi:** `POST /api/workflow-execution/jobs/{id}/pause {reason}`, cần `job.pause`. Chỉ áp dụng cho Job đang RUNNING.
- **Engine xử lý:**
  - MOVE đang chạy được **mở lại** (về PENDING) và lệnh của nó bị đánh dấu *superseded*, nên kết quả CANCELED robot gửi về sau sẽ bị bỏ qua.
  - Robot nhận STOP với mode PAUSE.
  - Job chuyển `PAUSED`, `failureCode = operator_paused`.
- **Traffic:** chỗ đã giữ không được trả lại, vì robot vẫn đứng ở vị trí dừng.
- **Robot offline lúc pause:** Job vẫn PAUSED, kèm thông báo "không liên lạc được robot (trạng thái chưa rõ)".
- **Resume** (`/jobs/{id}/resume`, endpoint đã có): nếu Job bị operator pause và robot đang giữ thì engine gửi RESUME cho robot trước, rồi mới phát một **lệnh MOVE mới**. Lệnh cũ không bao giờ được gửi lại.
- **Web:** trang chi tiết Job có các nút Pause, Resume ("release the robot") và Cancel job.

## 4. Quyền lái tay độc quyền (RB-04)

- **Lưu trữ:** lease nằm thẳng trên bản ghi Robot (`ManualLeaseHolderId`, `ManualLeaseHolderName`, `ManualLeaseUntil`), không cần bảng riêng. Lịch sử cấp, nhả và giành quyền nằm trong audit log.
- **Endpoint:** `POST /robots/{id}/manual/lease` để xin hoặc gia hạn (30 s), `DELETE` để nhả, `GET` để xem. Cần `robot.manual.drive` và robot nằm trong scope.
- **Không thể có hai người cùng giữ:** việc cấp quyền dùng một câu update có điều kiện "chưa ai giữ, hoặc đã hết hạn, hoặc chính mình đang giữ".
  - Người khác xin → `409 manual_lease_held`, kèm tên người đang giữ.
  - Admin giành quyền (`takeover`) bắt buộc có lý do; không có lý do thì 403.
- **Teleop:** chỉ người giữ lease mới gửi được lệnh có chuyển động (`manual_lease_required`). Lệnh `{0, 0}` (dừng) thì luôn được gửi.
- **AUTO và lái tay không tranh nhau:**
  - Không cấp lease khi robot đang chạy một lệnh, trừ khi robot đang bị giữ.
  - Robot đang có lease thì không được dispatch và không nhận NAVIGATE (`robot_in_manual_mode`).
- **Web:** bật Manual thì xin lease, gia hạn mỗi 10 s, tắt Manual hoặc rời trang thì nhả. Không giữ lease hoặc robot đang bị giữ thì không lái được, và màn hình hiển thị lý do.
- **Lớp an toàn phía robot giữ nguyên:** deadman 0,5 s, watchdog firmware 300 ms, giới hạn tốc độ 0,10 m/s.
- **Hạn chế đã biết:** lộ trình teleop trên robot thật ở semantic mode vẫn đi thẳng vào `cmd_vel_topic`, và `teleop_enabled: false` vẫn được giữ trong `robot_gateway_semantic.yaml`. Đưa teleop qua `collision_monitor` cần một bộ mux và quyết định về traffic authority khi lái tay; việc này ghi lại cho vòng sau, chưa làm trên robot thật.

## 5. Bảo trì (RB-08)

- **Bắt đầu:** `POST /robots/{id}/maintenance/start {reason}` (`robot.maintenance`).
  - Robot đang làm Job (RESERVED / EXECUTING / có lệnh đang chạy) thì bị từ chối.
  - Robot chuyển `MAINTENANCE` và một bản ghi `fleet.maintenance_records` được mở.
- **Kết thúc:** `POST /robots/{id}/maintenance/complete {sensorsOk, localizationOk, stopTestOk, trafficClear, notes}`.
  - **Chỉ chấp nhận khi cả bốn mục đều true**, nếu không thì `400 maintenance_checklist_failed`.
  - Robot về `AVAILABLE` (hoặc `OFFLINE` nếu không kết nối).
  - Checklist, người thực hiện và thời điểm được lưu.
- **Không bị thoát bảo trì ngoài ý muốn:** `Robot.MarkAvailable()` không ghi đè `MAINTENANCE`, nên một lệnh kết thúc không kéo robot ra khỏi bảo trì. Robot đang bảo trì không nhận NAVIGATE (`robot_in_maintenance`) và không được dispatch.
- **Lịch sử:** `GET /robots/{id}/maintenance`.

## 6. Lệnh nguồn (RB-09)

- **Gọi:** `POST /robots/{id}/system-actions {action, confirmRobotCode}`, cần `robot.power`.
- **Bốn điều kiện cùng lúc:**
  1. Robot **đã báo** hỗ trợ action đó trong heartbeat (`capabilities`).
  2. `confirmRobotCode` gõ đúng mã robot (xác nhận hai bước).
  3. Robot đang **bị giữ** (đã STOP).
  4. Robot không làm Job nào.
- **Phía robot, mặc định tắt:**
  - Mỗi action cần được bật trong `system_actions_enabled` và có câu lệnh riêng, ví dụ `system_action_restart_stack_command: "sudo -n /usr/bin/systemctl restart warotrans-robot.service"`, đi kèm một rule sudoers chỉ cho phép đúng lệnh đó.
  - Robot gửi RESULT trước rồi mới chạy lệnh.
- **Không có bật nguồn từ xa:** robot mất điện thì không còn MQTT để nhận lệnh; muốn bật từ xa cần một mạch điều khiển nguồn riêng. UI chỉ hiện các action robot đã báo hỗ trợ.

## 7. Chẩn đoán (RB-10)

- **Phía robot:** [`health_monitor.py`](https://github.com/devcldkai229/warotrans/blob/feature/robot-stop-teleop-diag/ros2_ws/src/warotrans_fleet/warotrans_fleet/health_monitor.py) là Python thuần. Gateway gửi snapshot lên MQTT `robots/{code}/health` mỗi 5 s, gồm:
  - **Topic cảm biến cấu hình được** (`health_topics: name:topic:type:min_hz[:optional]`), tính theo tần số thực tế:
    - topic bắt buộc mà im lặng → `ERROR`;
    - topic tùy chọn mà im lặng → `STALE`;
    - tần số thấp hơn mức yêu cầu → `WARN`.
  - Tuổi của TF `map→base_link` và trạng thái action server Nav2.
  - CPU (`/proc/loadavg`), nhiệt độ (`/sys/class/thermal`), RAM (`/proc/meminfo`). **Không đo được thì báo `UNKNOWN` với giá trị null, không tự đặt số.**
- **Phía backend:**
  - `RobotHealthStore` giữ snapshot mới nhất trong bộ nhớ (đây là màn xem trực tiếp).
  - Snapshot cũ hơn 15 s thì mọi mục chuyển `STALE`.
  - `GET /robots/{id}/health` cần `robot.diagnostics` và robot nằm trong scope; SignalR phát `robotHealthUpdated` tới các group của robot.
  - Trạng thái tổng lấy mức xấu nhất **trong các mục đo được**. Một mục không đo được, ví dụ không có cảm biến nhiệt, không làm cả robot thành UNKNOWN.

## 8. Web

- **Panel robot:** thêm card **Control**.
  - Nút Stop / Resume, kèm trạng thái stop: requested, accepted, verified, rejected hoặc unknown.
  - Nút bắt đầu bảo trì, checklist bốn mục, nút Return to service.
  - Nút nguồn, chỉ hiện các action robot báo hỗ trợ và chỉ bật khi robot đang bị giữ.
  - Danh sách Diagnostics.
- Hai nút giả "Pause" và "Unavailable" đã được bỏ.
- **Trang lái tay:** chạy theo lease như mục 4, hiển thị người đang giữ quyền hoặc thông báo robot đang bị giữ.
- **Trang Job:** các nút Pause, Resume và Cancel.

## 9. Kiểm thử

| Loại | Nội dung | Kết quả |
|---|---|---|
| Robot pytest (`test_motion_hold.py`, `test_health_and_payloads.py`) | STOP huỷ goal và chỉ báo verified khi robot đứng yên đủ 0,5 s; robot bị giữ từ chối NAVIGATE cho tới khi RESUME; không có odom thì `STOP_UNVERIFIED` và vẫn giữ; mode sai thì `INVALID_PAYLOAD`; SYSTEM_ACTION cần được bật, robot bị giữ và không có goal; health ERROR / STALE / WARN / UNKNOWN; payload có `motionHold` và `capabilities` | 321 qua trên Windows; `colcon test` trong WSL: 333 test, 0 lỗi |
| Backend unit | `RobotControlRulesTests` (mapping stop state không bao giờ báo dừng sai, selector loại robot bị giữ hoặc đang lái tay, lease hết hạn, MarkAvailable không phá bảo trì, capabilities so khớp chính xác, trạng thái tổng của health); engine: operator pause gửi STOP PAUSE, bỏ qua kết quả CANCELED cũ, resume nhả hold rồi gửi MOVE mới; robot bị giữ không start được Job | 645 qua (3 skip có sẵn) |
| Integration | `RobotControlEndpointTests`: Staff dừng được nhưng không resume được; STOP robot offline → 409; robot bị giữ không nhận NAVIGATE; lease độc quyền, takeover cần lý do, lệnh dừng luôn đi qua; vòng đời bảo trì kèm checklist; system action cần capability, robot đã dừng và gõ đúng mã | 21/21 (gồm `PermissionAuthorizationTests`); toàn bộ suite: xem log của lần chạy |
| **E2E Gazebo** (MAP-ONE-V004, RBT-SIM-01, backend Semantic) | STOP → `STOPPED_VERIFIED` sau ~1,07 s; `motionHeld=true` lấy từ telemetry; NAVIGATE khi đang giữ → 409; teleop khi đang giữ bị từ chối; health thật (lidar 6,8 Hz, odom và IMU 33 Hz, TF 3 ms, Nav2 OK, CPU 68 %, RAM 69 %, ultrasonic và nhiệt độ **UNKNOWN** vì sim không có); RESUME nhả hold | đạt |

## 10. Hạn chế và việc tiếp theo

- **Chưa có PHYSICAL PASS:** RB-03, RB-04 và RB-09 phải được kiểm chứng trên RBT-001 thật, gồm thời gian dừng thực tế, rule sudoers và việc gắn hold với gate trên `cmd_vel_motor`. Phần đó do bạn làm ở lab; mình không chạy gì trên robot thật.
- **Teleop qua `collision_monitor` trên robot thật:** xem mục 4.
- **Robot cũ** (gateway chưa cập nhật) không gửi `motionHold`, nên backend giữ nguyên giá trị đang có và stop-state chỉ tới được `ACCEPTED`/`UNKNOWN`. Đây là đúng thiết kế: không báo dừng khi chưa được xác minh.

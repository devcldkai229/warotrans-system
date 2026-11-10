# Phase 5: Dispatch giải thích được và chính sách pin

Phạm vi: **FL-01, FLT-01, FL-02, WEB-TR-03, HW-04 (phần backend/UI)**. Owner: Nguyễn Trung Nguyên.

Mục tiêu:
- Admin luôn biết **vì sao** một robot được chọn hoặc bị loại.
- Không có dispatch giả ở frontend.
- Một robot **chưa từng báo pin** không bao giờ bị coi là 0 % hay 100 %.

---

## 1. Luồng tổng quát

```
Start / Dispatch Job ──► JobExecutionEngine
                           │ busy = robot của các Job active khác
                           │ pickup = stop của task đầu tiên (pose endpoint)
                           ▼
                 IFleetModule.EvaluateDispatchAsync(DispatchQuery)
                           │  DispatchService → DispatchEligibility.Evaluate (pure) cho từng robot
                           ▼
                 [DispatchCandidate…]  eligible + reasons + score
                           │
          ┌────────────────┴───────────────┐
   tự chọn: robot eligible tốt nhất     chỉ định robotId: kiểm tra an toàn + pin (override?)
          └────────────────┬───────────────┘
                           ▼
          Job RUNNING ─► RecordDispatchDecisionAsync (FLT-01, kể cả khi không chọn được: NONE)
```

Toàn bộ bước chọn robot và lưu assignment nằm trong một `SemaphoreSlim` (DispatchGate). Nhờ vậy hai Job start cùng lúc không thể lấy cùng một robot rảnh. Giả định là backend chạy một instance; bước kiểm tra busy đọc các Job đã commit.

---

## 2. Tiêu chí eligibility (FL-01)

`DispatchEligibility.Evaluate(robot, query, now, lastCommandAt, BatteryOptions, DispatchOptions)` là hàm thuần. Cùng một kết quả được hiện ở UI, lưu vào DispatchDecision và dùng khi Start.

| Reason code | Điều kiện | Override được? |
|---|---|---|
| `robot_disabled` | `IsEnabled = false` | Không |
| `robot_offline` | `IsOnline = false` (heartbeat monitor) | Không |
| `robot_in_maintenance` | `Status = MAINTENANCE` (RB-08) | Không |
| `robot_not_available` | online nhưng Status ≠ AVAILABLE | Không |
| `robot_motion_held` | đang giữ STOP (RB-03) | Không |
| `robot_in_manual_mode` | có lease lái tay còn hạn (RB-04) | Không |
| `robot_map_mismatch` | khác map version của Job | Không |
| `robot_not_localized` | `LocalizationStatus ≠ LOCALIZED` | Không |
| `robot_busy` | đang chạy Job khác | Không |
| `battery_low` | SoC đã biết < `MinDispatchPercent` | **Không** |
| `battery_unknown` | chưa từng đo (`BatteryMeasuredAt = null`) | **Có** |
| `battery_stale` | lần đo cuối cũ hơn `StaleSeconds` | **Có** |

Chỉ hai lý do **"không biết pin"** là override được, và cần quyền `dispatch.override` cộng một lý do bằng chữ. An toàn, bảo trì, lái tay và pin thấp **không bao giờ** override được.

**Score** (thấp hơn là tốt hơn; trọng số đặt ở `Fleet:Dispatch`):

```
score = khoảng_cách(m) × DistanceWeight
      + (100 − SoC) × BatteryWeight            // pin chưa biết tính như 50 %
      − min(idle, IdleCapSeconds)/IdleCapSeconds × IdleBonus
```

- Khoảng cách: Euclid từ pose robot (chỉ khi LOCALIZED) tới endpoint pickup.
- `idle`: thời gian từ lệnh robot gần nhất (`RobotCommands.IssuedAt`).
- Danh sách xếp robot eligible trước, theo score; robot bị loại xếp sau, theo mã robot.

**Payload capacity:** chưa đưa vào. Container và robot hiện chưa có trọng lượng hay tải trọng, nên tiêu chí này được ghi là "unknown" thay vì đoán.

---

## 3. Chính sách pin (HW-04, phía backend)

### 3.1 Dữ liệu
- `Robot.BatteryMeasuredAt` (cột mới): thời điểm telemetry gần nhất **có** giá trị pin.
- `RobotResponse.batteryPercent` và `RobotSnapshot.BatteryPercent` trả **null** khi chưa từng đo.
- SignalR `robotTelemetryUpdated` cũng gửi `batteryPercent: null`.

### 3.2 Trạng thái pin
| Trạng thái | Điều kiện |
|---|---|
| UNKNOWN | chưa đo |
| STALE | lần đo cuối cũ hơn `StaleSeconds` |
| CRITICAL | SoC ≤ `CriticalPercent` |
| LOW | SoC ≤ `LowPercent` |
| OK | còn lại |

### 3.3 Cấu hình `Fleet:Battery`
| Khoá | Mặc định | Ý nghĩa |
|---|---|---|
| `LowPercent` | 20 | Ngưỡng LOW |
| `CriticalPercent` | 10 | Ngưỡng CRITICAL |
| `MinDispatchPercent` | 30 | Dưới mức này không giao việc mới |
| `StaleSeconds` | 15 | Lần đo cũ hơn thì coi là stale |
| `AllowUnknownBatteryDispatch` | **false** | Cho phép tự dispatch robot chưa từng báo pin |

### 3.4 Tác động hiện tại
- **CHECK `BATTERY_MIN`** trong workflow trả FAIL với `battery_unknown` khi robot không có số đo. Trước đây giá trị null bị đọc thành 0 %.
- **Resume:** robot có pin **đã biết là thấp** sẽ bị từ chối. Pin chưa biết không chặn resume, vì robot vốn đang làm Job đó; tình trạng pin vẫn được ghi vào decision.
- **Cảnh báo pin thấp:** lần đo đầu tiên của một robot trước đó chưa đo được coi như "đi từ 100 %". Một robot vừa gắn cảm biến mà pin đã thấp vẫn phát cảnh báo.
- **Robot thật RBT-001:** hiện chưa có module đo áp (telemetry gửi null), nên robot sẽ **không được tự dispatch**. Operator có hai cách:
  1. Dispatch thủ công với override và lý do (quyền ADMIN), hoặc
  2. Bật tạm `Fleet:Battery:AllowUnknownBatteryDispatch=true` trong môi trường dev.

**Phía robot:** phần mềm HW-04 đã nằm ở nhánh `feature/battery-soc-voltage` (commit 2f7db57). Nhánh này gồm:
- firmware dòng `B`;
- estimator `battery_soc.py`;
- `battery_monitor_node`;
- `battery_sim_node`;
- gateway gửi `batteryPercent` null khi chưa có ước lượng mới, kèm các trường `batteryVoltage`, `batteryEstimationMode`, `batteryConfidence`, `batteryChargingState`, `batteryMeasuredAt`.

Backend nhận và lưu `voltage`, `mode` và `confidence` để hiển thị.

Hiệu chuẩn V0–V8 vẫn chờ lắp phần cứng; nhãn "CHƯA XÁC NHẬN" giữ nguyên.

---

## 4. API (FL-02, FLT-01)

| Method | Route | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/workflow-execution/jobs/{id}/dispatch-candidates` | `job.read` | Mọi robot trong warehouse của map: eligible, reasons, overridable, pin, khoảng cách, idle, score. |
| POST | `/api/workflow-execution/jobs/{id}/dispatch` `{robotId?, overrideReason?}` | `job.operate` (+ `dispatch.override` khi có overrideReason) | Start Job trên robot chỉ định hoặc robot tốt nhất. Audit `job.dispatched`. |
| GET | `/api/workflow-execution/jobs/{id}/dispatch-decisions` | `job.read` | 20 quyết định gần nhất: SELECTED/NONE, trigger START/RESUME, actor, override reason, snapshot candidates. |

**Mã lỗi:**
- `no_robot_available` (message liệt kê lý do của tối đa 5 robot);
- `battery_low`, `battery_unknown`, `battery_stale`;
- `403 forbidden` khi STAFF gửi `overrideReason`.

`dispatch_decisions` có thêm cột `trigger`, `actor_id`, `override_reason`; `candidate_evaluations` (jsonb) giờ có schema cố định là `DispatchCandidate`. Migration `AddDispatchDecisionTraceAndBatteryMeasuredAt`.

`POST /jobs/{id}/start` cũ vẫn hoạt động và đi qua cùng đường evaluate và record. Endpoint này không có override.

---

## 5. Giao diện (WEB-TR-03)

**Web:**
- `DispatchPanel` trên trang Job (thay mock `DISPATCH_DECISIONS`, đã xoá) gồm:
  - bảng robot: pin (`Unknown` / `(old)`), khoảng cách, score, nhãn Eligible hoặc lý do bị loại;
  - dòng "Last decision … override: …";
  - nút **Dispatch to best robot**, **Use** (robot eligible) và **Override** (chỉ hiện khi robot overridable và user có `dispatch.override`; hỏi lý do).
- Mọi chỗ hiển thị pin dùng `formatBattery()`: null hiện "Unknown", không có Meter.

**App:** `formatBattery()` dùng cho Fleet Recall và Map; bỏ `?? 0` trong RealtimeContext. Category `ROBOT_BATTERY_LOW` đã map sẵn.

---

## 6. Kiểm thử
| Loại | Nội dung | Kết quả |
|---|---|---|
| Unit `DispatchEligibilityTests` | Robot sẵn sàng; pin unknown chỉ override được; cấu hình cho phép unknown; stale; pin thấp không override được; liệt kê đủ lý do an toàn; xếp hạng theo khoảng cách | 7/7 |
| Integration `DispatchEndpointTests` | Candidates nêu lý do và tự dispatch trả NONE; pin unknown cần override và decision lưu lý do; pin thấp không override được và STAFF override bị 403; robot tốt nhất được chọn | 4/4 |
| Web | typecheck và 25 test | Pass |
| App | 111 test | Pass |

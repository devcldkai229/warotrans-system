# Pin robot (SOC) trong backend, Web và App

Phía robot (phần cứng, firmware, thuật toán, quy trình hiệu chuẩn) được mô tả trong repo robot:
`robotSource/warotrans/docs/hardware/battery-voltage-sensor.md`.

> **Trạng thái:** robot thật **chưa lắp** cảm biến pin, nên đang gửi `batteryPercent: null` (`UNAVAILABLE`).
> Sim gửi `SIMULATED` (giá trị cố định), hoặc `VOLTAGE_ONLY` khi chạy với `battery_sim:=true`.

## 1. Nguyên tắc: UNKNOWN không bao giờ là 0 %

- **Trước đây:**
  - `Robot.BatteryPercent` không cho phép null, mặc định 0.
  - Telemetry gửi null thì backend **bỏ qua**, giữ nguyên số cũ.
  - Hệ quả: robot thật luôn hiện 0 %, và `CHECK BATTERY_MIN` lúc nào cũng FAILED.
- **Bây giờ:**
  - `BatteryPercent` là `decimal?`. Mỗi telemetry **thay toàn bộ** snapshot pin.
  - Gửi `null` thì pin là Unknown ngay lúc đó. Số cũ không được giữ lại, và không có gì bị gán 0.
  - Migration `AddRobotBatteryEstimate` reset giá trị cũ về Unknown. Pin là snapshot runtime, nên telemetry kế tiếp sẽ điền lại.
- **Web và App** hiển thị chữ **"Unknown"** khi chưa biết pin, không bao giờ hiện 0 % hay 100 % giả.

## 2. Contract MQTT (bổ sung, schemaVersion vẫn là 1)

Chi tiết nằm ở `docs/mqtt-robot-contracts.md` § Telemetry.

| Trường | Giá trị |
|---|---|
| `batteryPercent` | 0..100, hoặc `null` nghĩa là Unknown |
| `batteryVoltage` | V, hoặc `null` |
| `batteryEstimationMode` | `VOLTAGE_ONLY` \| `SIMULATED` \| `UNAVAILABLE` (khi `UNAVAILABLE` thì `batteryPercent` bắt buộc là `null`) |
| `batteryConfidence` | `MEDIUM` (đo lúc nghỉ) \| `LOW` (đang chạy, vừa dừng, hoặc vừa khôi phục) \| `NONE` |
| `batteryChargingState` | `UNKNOWN` \| `CHARGING` \| `NOT_CHARGING`. Robot luôn gửi `UNKNOWN`, vì điện áp không cho biết có đang sạc hay không |
| `batteryMeasuredAt` | thời điểm gateway nhận estimate |

Gateway cũ không gửi `batteryEstimationMode`:
- có số % thì backend coi là mode `REPORTED`;
- là `null` thì coi là Unknown.

## 3. Lưu trữ (Fleet `robots`)

| Cột | Ý nghĩa |
|---|---|
| `battery_percent` | SOC, hoặc `NULL` |
| `battery_voltage` | điện áp pack |
| `battery_estimation_mode` | mode ước lượng |
| `battery_confidence` | độ tin cậy |
| `battery_charging_state` | trạng thái sạc |
| `battery_updated_at` | **giờ server** lúc nhận được % hợp lệ. Dùng giờ server, không dùng đồng hồ robot, để tránh lệch giờ |

`batteryChargingState` chỉ mang tính thông tin. Nó **không** đổi `Robot.Status`, vì `Status` do backend sở hữu.

## 4. Cấu hình `Fleet:Battery` (appsettings.json)

| Khoá | Mặc định | Ý nghĩa |
|---|---|---|
| `LowPercent` | 20 | Ngưỡng cảnh báo WARNING `ROBOT_BATTERY_LOW` |
| `CriticalPercent` | 10 | Ngưỡng cảnh báo ALERT `ROBOT_BATTERY_CRITICAL` |
| `MinDispatchPercent` | 30 | SOC tối thiểu để được tự giao Job |
| `RecoverHysteresisPercent` | 5 | Cảnh báo được resolve khi SOC lên trên `LowPercent` + giá trị này |
| `StaleAfterSeconds` | 15 | % đã biết nhưng cũ hơn mức này, hoặc robot offline, thì bị coi là stale |
| `AllowUnknownBatteryDispatch` | **false** | Override cho phát triển có giám sát (xem §5) |

## 5. Giao Job theo pin (`BatteryDispatchPolicy`)

**Bốn trạng thái:**

| Trạng thái | Khi nào |
|---|---|
| `UNKNOWN` | không biết % |
| `LOW` | % đã biết nhưng dưới `MinDispatchPercent`. **Kể cả khi đã stale vẫn là LOW** |
| `STALE` | % đã biết nhưng cũ, hoặc robot offline |
| `ELIGIBLE` | % đã biết, còn mới, đủ ngưỡng |

**Production** (`AllowUnknownBatteryDispatch=false`): chỉ robot `ELIGIBLE` mới được giao Job.
- **Start Job tự chọn robot:**
  - Nếu còn robot rảnh nhưng không con nào có pin dùng được, backend trả `409 no_robot_battery_eligible`, kèm danh sách robot và lý do.
  - **Job vẫn ở CREATED/QUEUED**, vẫn tạo và xếp hàng Job được bình thường. Bấm Start lại sau khi có robot đủ pin.
- **Start hoặc Resume với robot chỉ định:** trả `409` với một trong các mã `robot_battery_unknown`, `robot_battery_stale`, `robot_battery_low`.

**Phát triển có giám sát:** bật rõ ràng bằng biến môi trường:
```
Fleet__Battery__AllowUnknownBatteryDispatch=true
```
- Override **chỉ** bỏ qua `UNKNOWN` và `STALE`, **không bao giờ** bỏ qua `LOW` khi đã biết pin.
- Override không được bật sẵn trong `appsettings.Development.json`: mỗi lần dùng phải bật có chủ ý.

**Bước workflow `CHECK BATTERY_MIN`:**
- Pin Unknown hoặc stale thì luôn FAILED, với reason `battery_unknown` / `battery_stale`.
- Bước này **không có override**, và không đọc Unknown thành 0 %.

**Thứ tự ưu tiên khi chọn robot:** SOC cao trước, robot Unknown xếp cuối, sau đó theo mã robot.

## 6. Cảnh báo (`BatteryAlertRules`)

- **Phát một lần khi SOC đi vào một mức**, không phát lại ở mỗi lần đọc:
  - ≤ `LowPercent` → `ROBOT_BATTERY_LOW` (WARNING);
  - ≤ `CriticalPercent` → `ROBOT_BATTERY_CRITICAL` (ALERT).
- **Resolve** cả hai khi SOC lên trên `LowPercent + RecoverHysteresisPercent`.
- **Không cảnh báo khi:** SOC Unknown, hoặc robot đang ở `Status = CHARGING`.

## 7. API và realtime

- **REST** `GET /api/fleet/robots[/{id}]`:
  - giữ trường `batteryPercent` (có thể `null`) cho client cũ;
  - thêm object `battery` gồm `percent`, `voltage`, `estimationMode`, `confidence`, `chargingState`, `updatedAt`, `isStale`, `dispatchStatus`, `dispatchAllowed`.
- **SignalR** `robotTelemetryUpdated`: `batteryPercent` (có thể `null`) cùng object `battery` như trên.
- **Thống kê** `GET /api/fleet/statistics/robots`:
  - `lowBattery` và `averageBatteryPercent` chỉ tính robot đã biết pin;
  - thêm `unknownBattery`;
  - thêm `lowBatteryPercent`, là ngưỡng đang cấu hình, để UI khỏi hard-code 20.

## 8. Web và App

- **Web:**
  - Component `shared/ui/BatteryIndicator.tsx` và hàm `shared/ui/battery.ts`.
  - Hiển thị %, hoặc "Unknown" (khi Unknown thì không có thanh meter).
  - Dòng phụ: `11.43 V · Voltage estimate · Low confidence · Stale`.
  - Trạng thái dispatch hiện trong Robot detail.
  - Lỗi Start Job do cổng pin được dịch thành câu dễ hiểu.
- **App:**
  - `src/shared/utils/battery.ts`.
  - Bỏ `?? 0` và bỏ "Battery: 92%" hard-code.
  - Các màn Home, Fleet recall, Job, bản đồ live hiện "Unknown" khi chưa biết pin.
- **Telemetry live** thắng giá trị REST cũ, kể cả khi live báo Unknown: một số % cũ không được ở lại trên màn hình.

## 9. Kiểm thử

| Bộ test | Nội dung |
|---|---|
| `WaroTrans.UnitTests/Fleet/Battery/*` | Policy, cảnh báo, validator, ánh xạ telemetry |
| `JobExecutionEngineTests` | Chặn khi UNKNOWN/STALE/LOW và Job vẫn queued; robot chỉ định bị từ chối; override; `CHECK BATTERY_MIN` khi Unknown |
| Web `shared/ui/battery.test.ts` | Hàm format và hiển thị pin |
| App `tests/battery.test.cjs` | Hàm format và hiển thị pin |
| Integration (`RobotRegistryEndpointTests`, `NotificationIntegrationTests`) | Đã cập nhật theo ngữ nghĩa null. **Các test này xoá DB dev 5433, phải hỏi trước khi chạy** |

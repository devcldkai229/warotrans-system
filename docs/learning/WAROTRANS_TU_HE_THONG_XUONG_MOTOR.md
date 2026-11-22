# WaroTrans: từ hệ thống xuống tới motor

Tài liệu học dự án. Đọc theo thứ tự từ trên xuống. Mọi topic, field và con số đều lấy từ code của ba repo
(`warotrans-system`, `warotrans` = RBT-001, `warotrans-rbt2` = RBT-002) tại ngày 2026-11-23.

---

## 0. Bức tranh tổng thể

```
 Web admin / App staff                         (React, Expo)
        │ HTTP REST + SignalR
        ▼
 WaroTrans.Host  (.NET, laptop/AWS)            backend: TR → Job → MOVE, Traffic, Fleet
        │ MQTT (Mosquitto, JSON)
        ▼
 robot_gateway_node  (Pi, Python, ROS 2)       cầu nối MQTT ↔ ROS 2, gate traffic
        │ ROS 2 action / topic (DDS)
        ▼
 Nav2  (bt_navigator, planner, controller…)   lập đường, bám đường, sinh /cmd_vel
        │ /cmd_vel  (geometry_msgs/Twist)
        ▼
 Driver node trên Pi                           RBT-001: esp32_bridge_node   RBT-002: base_controller + rrc_lite_node
        │ Serial USB
        ▼
 Firmware vi điều khiển                         RBT-001: ESP32 (warotrans_low_level.ino)   RBT-002: STM32 RRC Lite (patched)
        │ PWM + DIR
        ▼
 Mạch công suất → motor → bánh xe → encoder đọc ngược lên
```

Ba ý cần nhớ:

1. **Backend không lái robot.** Backend chỉ ra lệnh "đi tới pose (x, y, yaw)" và **cấp quyền dùng không gian** (ô 10 cm, zone). Đường đi cụ thể do Nav2 trên robot tự lập.
2. **Robot không tự ý chạy.** Nav2 lập đường xong, gateway gửi đường đó lên backend (`traffic_plan`). Chỉ khi backend cấp quyền (grant), cổng `cmd_vel_authority_gate` mới cho lệnh vận tốc đi xuống motor.
3. **Một tầng hỏng thì tầng dưới dừng.** Firmware có watchdog 300 ms: không nhận lệnh mới là PWM về 0. Gate phía robot đóng khi grant hết hạn. Collision monitor chặn khi LiDAR thấy vật cản.

---

## 1. Kiến thức ROS 2 cần có

| Khái niệm | Là gì | Ví dụ trong dự án |
|---|---|---|
| **Node** | Một tiến trình hoặc chương trình con, làm một việc | `esp32_bridge_node`, `amcl`, `robot_gateway` |
| **Topic** | Kênh publish/subscribe, nhiều-nhiều, không cần trả lời | `/cmd_vel`, `/scan`, `/odom`, `/plan` |
| **Message** | Kiểu dữ liệu trên topic | `geometry_msgs/Twist`, `nav_msgs/Odometry`, `sensor_msgs/LaserScan` |
| **Service** | Gọi một lần và chờ trả lời | `/set_initial_pose`, clear costmap |
| **Action** | Việc dài, có feedback, có thể huỷ | `NavigateToPose`, `FollowPath`, `ComputePathToPose` |
| **TF** | Cây toạ độ `map → odom → base_footprint → base_link → laser/imu` | AMCL publish `map→odom`; EKF/odom publish `odom→base_footprint` |
| **Parameter** | Cấu hình của node, nạp từ file YAML | `nav2_params.yaml`, `hardware.yaml`, `rbt002.yaml` |
| **Launch file** | Script Python bật nhiều node cùng lúc | `navigation.launch.py`, `fleet.launch.py` |
| **DDS / ROS_DOMAIN_ID** | Lớp mạng của ROS 2. Các node chỉ thấy nhau khi cùng domain | RBT-002 dùng domain 31 |
| **Lifecycle node** | Node có các trạng thái configure → activate | Mọi server của Nav2 (nav2_lifecycle_manager bật chúng) |

**Cây TF**, cần hiểu rõ vì mọi lỗi lệch vị trí đều nằm ở đây:

```
map ──(AMCL: so LiDAR với bản đồ)──► odom ──(EKF: bánh xe + IMU)──► base_footprint ──(URDF cố định)──► base_link ──► laser, imu_link
```

- `odom → base_footprint`: mượt và liên tục, nhưng **trôi dần** theo thời gian.
- `map → odom`: AMCL sửa phần trôi đó. Nó có thể **nhảy**, ví dụ hiện tượng "AMCL jumps" đã gặp ngày 2026-11-10.

---

## 2. Luồng một chuyến hàng, từ hệ thống xuống motor

Ví dụ: nhân viên tạo TR INBOUND, robot RBT-001 phải đi tới `EP-INBOUND`.

### Bước 1. Web/App → Backend (HTTP)

- `POST /api/transportation/transport-requests` tạo TR, gồm container, `sourceEndpointId` và `destinationEndpointId`.
- `POST …/{tr}/queue` tách TR thành các **Job**. Mỗi Job chở tối đa `JobPlanning:MaxContainersPerJob` container.
- `JobQueueProcessor` chọn robot rảnh (dispatch), rồi `JobExecutionEngine` chạy từng **Step** của workflow:
  `MOVE_TO_INBOUND_AREA` (MOVE) → `CONFIRM_GOODS_PICKUP` (HUMAN_INTERACTION) → `MOVE_TO_STORAGE_LOCATION` → `CONFIRM_GOODS_STORAGE`.

### Bước 2. Engine bắt đầu một MOVE

Code: `JobExecutionEngine.StartMoveAsync`, nhánh Semantic. Thứ tự kiểm tra:

1. Pose robot còn mới không (telemetry < N giây) và đã `LOCALIZED` chưa.
2. Bundle map trên đĩa (`Traffic:SemanticMapDirectory`) có cùng `mapVersionId` với Job không. Nếu khác thì `semantic_map_mismatch`.
3. `EnsureTrackedAsync`: traffic ghi nhận robot đang đứng đâu và chiếm các ô dưới thân nó (seed).
4. Goal có bận không (`GoalBusyByAsync`). Nếu bận thì chọn chỗ chờ (`GoalWaitPlaceAsync`), xem mục 5.
5. `fleet.NavigateAsync(...)` tạo bản ghi `robot_commands` và publish MQTT.

### Bước 3. Backend → Robot (MQTT)

**Topic:** `warotrans/v1/robots/RBT-001/command` (QoS 1). Tiền tố đặt ở `Mqtt:TopicPrefix`; harness test dùng `warotrans-e2e/v1`.

```json
{
  "schemaVersion": 1,
  "messageId": "…",           // id của gói tin, chống xử lý trùng
  "commandId": "7ce03f14-…",  // id lệnh, robot trả ACK/RESULT theo id này
  "robotCode": "RBT-001",
  "type": "NAVIGATE_TO_POSE",  // khác: CANCEL, STOP, RESUME, LOCALIZE, EXTEND_AUTHORITY, RENEW_/REVOKE_AUTHORITY, SYSTEM_ACTION
  "issuedAt": "2026-11-23T01:42:29Z",
  "expiresAt": "…+60s",        // robot từ chối lệnh đến muộn (COMMAND_EXPIRED), tránh chạy lệnh cũ
  "jobAssignmentId": "…", "jobStepId": "…",   // để robot báo về đúng step
  "payload": {
    "frameId": "map",
    "x": 2.095, "y": 1.253, "yaw": 1.5708,   // pose đích (mét, radian) trong frame map
    "timeoutSeconds": 360,                   // quá hạn thì robot huỷ Nav2 và báo FAILED
    "positionTolerance": 0.12,               // dung sai tới đích (m), lấy từ endpoint
    "authority": null                        // Semantic: quyền đi được cấp sau, qua EXTEND_AUTHORITY
  }
}
```

Robot trả lời qua các topic:

| Topic | Chiều | Nội dung |
|---|---|---|
| `…/command_ack` | robot → backend | `accepted` true/false, `reasonCode`. Robot đã nhận lệnh |
| `…/command_result` | robot → backend | `SUCCEEDED` / `FAILED` / `CANCELED` cùng lý do |
| `…/heartbeat` | robot → backend, 1 Hz | còn sống, `bootId`, `sequence` |
| `…/telemetry` | robot → backend, 5 Hz | `pose{x,y,yaw}`, `batteryPercent`, `navigationStatus`, `localizationStatus`, `linearVelocity`, `angularVelocity`, `currentCommandId`, `errorCode`, `motionHold` |
| `…/traffic_plan` | robot → backend | đường Nav2 vừa lập: `poses[]`, `planRevision`, `planHash`, `semanticMapFingerprint`, `commandId` |
| `…/traffic_plan_reject` | backend → robot | plan bị từ chối hoặc phải chờ, kèm lý do (`Capacity:blocker=…`) |
| `…/traffic_progress` | robot → backend | `STARTED`, `SAFE_STOP_REACHED`, `FAULT`…, kèm pose, `clearedResourceIds` (ô robot đã rời) |
| `…/authority_state` | robot → backend | robot đang giữ grant nào, để backend đối chiếu (reconcile) |
| `warotrans/v1/traffic/epoch` | backend → mọi robot, retained | "nhiệm kỳ" của bộ điều phối. Grant thuộc epoch cũ bị bỏ |
| `…/teleop`, `…/interaction_*` | hai chiều | lái tay; nút xác nhận trên robot |

### Bước 4. Robot nhận lệnh (`robot_gateway_node`)

1. `command_router` kiểm tra schema, `expiresAt` và lệnh trùng, rồi trả `command_ack`.
2. `move_command_handler` gửi action **`NavigateToPose`** cho Nav2, hoặc qua `docking_navigator` khi cần vào bay thẳng/lùi.
3. Nav2 lập đường và publish lên topic **`/plan`** (`nav_msgs/Path`).
4. Gateway nghe `/plan`, gọi `SemanticTrafficClient.on_plan(...)` rồi gửi **`traffic_plan`** lên backend.
5. **Chưa có grant thì robot chưa chạy:** `/traffic/authority_ok = false` và `cmd_vel_authority_gate` chặn mọi lệnh vận tốc.

### Bước 5. Backend cấp quyền (traffic Semantic)

`TrafficProgressIngress` nhận plan, rồi `TrafficState.AcquireSemanticPlan(...)` xử lý:

- Biến đường thành **tài nguyên**:
  - `cell:ix:iy`: ô 0.10 m;
  - `zone:ZONE-…`: zone single-occupancy.
  - Chi tiết cách tính ở mục 4.
- Chỉ xét **2 m đầu** của đường (horizon). Có prefix grant: cấp phần đầu còn trống, phần sau cấp dần.
- Nếu không ô nào đang bị robot khác giữ thì **grant**. Backend gửi lệnh `EXTEND_AUTHORITY` xuống topic `command`, payload gồm:
  - `resourceIds`: danh sách ô/zone được phép;
  - `expiresAt`: hạn TTL 30 s, gia hạn bằng `RENEW_AUTHORITY`;
  - `planRevision`, `planHash`: grant này cho đúng plan nào;
  - `geometry`: cellSize, horizon, reserveRadius, laneHalfWidth, footprint… để robot tự tính giống hệt backend.
- Nếu bận thì trả `traffic_plan_reject` kèm `wait=Capacity`, `blocker=<robot>`. Robot đứng chờ và gửi lại plan định kỳ.

### Bước 6. Robot chạy

1. Gate nhận grant, `/traffic/authority_ok = true` (20 Hz). `cmd_vel_authority_gate` bắt đầu chuyển lệnh.
2. Mỗi 50 ms gate kiểm tra **thân xe hiện tại có nằm trong các ô được cấp không**. Nếu lệch ra ngoài thì `OUTSIDE_RESERVATION` và đóng gate.
3. Ô nào robot đã đi qua hết thì báo `clearedResourceIds`, backend nhả ô đó cho robot khác.

### Bước 7. Nav2 tạo lệnh vận tốc: chuỗi `cmd_vel` của RBT-001

```
controller_server (RPP) ─► /cmd_vel_nav ─► velocity_smoother ─► /cmd_vel_smoothed ─► collision_monitor
   ─► /cmd_vel_safe ─► cmd_vel_authority_gate ─► /cmd_vel ─► esp32_bridge_node
```

`geometry_msgs/Twist` chỉ dùng hai field:

- `linear.x`: vận tốc tiến (m/s). Dương là tiến, âm là lùi.
- `angular.z`: vận tốc quay (rad/s). Dương là quay trái (ngược chiều kim đồng hồ).

Robot 4 bánh skid-steer không đi ngang được, nên `linear.y = 0`.

`esp32_bridge_node` chỉ nhận `/cmd_vel` khi publisher duy nhất là node được chỉ định (`required_cmd_vel_publisher`). Cơ chế này chống việc hai nguồn cùng lái robot.

### Bước 8. Pi → firmware (RBT-001: ESP32)

**Serial USB:** `/dev/warotrans`, **921600 baud**, giao thức text từng dòng.

| Dòng | Chiều | Ý nghĩa |
|---|---|---|
| `V <linear_mps> <angular_rps>\n` | Pi → ESP32 | vận tốc thân xe, ví dụ `V 0.350000 0.000000` |
| `C <name> <value>\n` | Pi → ESP32, lúc kết nối | cấu hình: `min_duty`, `closed_loop`, `kp`, `ki`, `mpt_l/r` (mét/tick), `sep` (khoảng cách bánh hiệu dụng), `rear_fb`… |
| `O <fl> <fr> <rl> <rr> <millis>\n` | ESP32 → Pi, 50 Hz | số tick cộng dồn của 4 encoder và đồng hồ MCU |
| `K …` | ESP32 → Pi | phản hồi cấu hình, lỗi (`K ERR`, `K FAULT rear_fb`) |
| (dòng pin) | ESP32 → Pi | mẫu ADC pin, ra topic `/battery/adc_sample` |

### Bước 9. Firmware → motor (ESP32)

1. **Mixer skid-steer:** `v_trái = v − ω·sep/2`, `v_phải = v + ω·sep/2`, với `sep = 0.396 m` (hiệu dụng, đo bằng LiDAR ICP).
2. **PI vòng kín** mỗi 20 ms: đo tốc độ bánh từ encoder (tick × mét/tick), so với vận tốc đặt rồi ra duty PWM. Thông số `kp 600`, `ki 1500`.
3. **PWM + DIR** tới driver **MDD10A**, mỗi bên một kênh:
   - trái: PWM GPIO4, DIR GPIO5;
   - phải: PWM GPIO6, DIR GPIO7.
   - Bánh trước và sau cùng bên dùng chung một kênh.
4. **An toàn:**
   - `command_watchdog_ms = 300`: không nhận `V` mới trong 300 ms thì motor dừng.
   - `stall_fault_ms = 1000`: bánh không quay dù có duty thì báo lỗi.
   - Có trần PWM.
5. Encoder đọc ngược lên:
   - `O …` đi tới `/wheel_ticks`, rồi `wheel_odom_node` tính ra `/odom` và TF `odom→base_footprint`;
   - EKF trộn `/odom` với IMU `/imu/data` (BNO055);
   - AMCL so `/scan` với bản đồ để sửa `map→odom`.
   - Gateway đọc TF `map→base_footprint` làm pose và gửi telemetry lên backend. Vòng khép kín.

### Bước 10. Tới nơi

- Nav2 báo action `SUCCEEDED` (đúng dung sai xy/yaw của goal checker).
- Gateway gửi `command_result SUCCEEDED`.
- Backend đánh dấu MOVE `COMPLETED` và traffic thu vùng chiếm về chỗ robot đứng (`CompleteRoute`).
- Step `CONFIRM_GOODS_PICKUP` mở: app hiện nút nhận hàng, nhân viên quét mã container.
- Job sang MOVE kế tiếp.

---

## 3. RBT-001 và RBT-002 khác nhau thế nào

| | **RBT-001** (repo `warotrans`) | **RBT-002** (repo `warotrans-rbt2`) |
|---|---|---|
| Máy tính | Raspberry Pi, `warotrans.local` | Raspberry Pi 5, `warotrans-rbt002.local` |
| Vi điều khiển | **ESP32**, firmware tự viết `firmware/warotrans_low_level` | **Hiwonder RRC Lite (STM32)**, firmware hãng đã **patch** (v1.2) |
| Giao thức serial | Text: `V lin ang`, `O ticks…`, 921600 baud | Nhị phân: `AA 55 func len data crc8`, 1 Mbaud |
| Ai đổi vận tốc thân xe → bánh | **Firmware** (mixer + PI trên ESP32) | **Pi** (`base_controller_node` → `kinematics.py`) gửi **rps từng bánh**; STM32 chạy PID mỗi motor |
| Driver motor | MDD10A, 2 kênh (mỗi bên 1 kênh, 4 motor) | 4 kênh trên RRC Lite, motor JGB37-528 (`motor_type 3`) |
| Encoder | 4 encoder (2 sau thêm ngày 2026-11-20) | 4 encoder, đọc qua gói `MOTOR_FEEDBACK 0x80` (có từ bản patch) |
| IMU | BNO055 riêng (I²C), `/imu/data` | IMU trên bo RRC Lite, `/rrc_lite/imu_raw`; `sensor_adapter` học bias gyro khi đứng yên |
| LiDAR | đặt trước tâm xe 0.10 m | đặt **quay ngược** (yaw π), mũi số 0 của LiDAR hướng ra sau |
| Watchdog | firmware 300 ms | firmware gốc **không có**, nên Pi có `cmd_timeout_s 0.3`; mất Pi thì motor giữ setpoint cũ |
| Pin | theo `battery.yaml` | 3S Li-ion 12.6 V, firmware giới hạn PWM ở 8 V cho motor |
| ROS_DOMAIN_ID | mặc định | 31 |
| Home | EP-PARKING-A | EP-PARKING-B |

**Chuỗi lệnh của RBT-002:**

```
Nav2 … ─► control_gateway (gộp nav/teleop) ─► /cmd_vel ─► base_controller_node
   ─► /rrc_lite/motor_setpoints (rps 4 bánh) ─► rrc_lite_node ─► Serial: AA 55 | 03 (MOTOR) | len | 01 (SET_MANY) n (id, rps f32)×4 | crc8
   ─► STM32: PID từng motor ─► PWM ─► motor
encoder ─► gói 0x80 (counts[4], rps[4]) ─► /rrc_lite/encoders ─► odom_node ─► /odom
```

Ý nghĩa các trường trong gói RRC Lite:

- `AA 55`: hai byte mở đầu, đánh dấu đầu gói.
- `func`: nhóm chức năng: `0` SYS, `3` MOTOR, `7` IMU, `12` ULTRASONIC (bản patch).
- `len`: độ dài phần data.
- `data`: byte đầu là sub-command, ví dụ `MOTOR_SET_MANY 0x01`, `MOTOR_STOP_MASK 0x03`, `MOTOR_SET_TYPE 0x05`.
- `crc8`: CRC8-Maxim, kiểm tra lỗi đường truyền.

**Bài học riêng của RBT-002:**

- Phải gửi `set_motor_type` **ngay khi kết nối và gửi lại khi MCU reset**. Có lần gói này bị mất, firmware chạy preset JGB37, bánh quay chỉ còn khoảng 1/2.9 tốc độ đặt.
- LiDAR và gyro không phân biệt được trước/sau: lật dấu cả 4 motor cũng lật luôn chiều quay. Vì vậy **phải nhìn tận mắt** robot đi đúng chiều.

---

## 4. Traffic: backend cấp không gian thế nào

### 4.1 Tài nguyên

- **Ô (cell):** lưới 0.10 m. Id dạng `cell:ix:iy`, với `ix = floor(x / 0.10)`.
- **Zone single-occupancy:** cả zone là một tài nguyên, mỗi lúc chỉ một robot.
- **NO_STOP:** không được dừng chờ bên trong. **KEEP_OUT:** plan chạm vào là bị từ chối.

### 4.2 Một plan chiếm những gì (`SemanticReservation.CollectResources`)

Backend lấy mẫu đường mỗi 2.5 cm trong 2 m đầu. Mỗi mẫu chiếm:

| Đoạn | Hình chiếm | Vì sao |
|---|---|---|
| Đoạn thẳng, hướng ổn định | **hình chữ nhật** nửa rộng 0.25 m theo hướng đi (`LaneHalfWidthMeters`) | hai lane ngược chiều cách nhau 0.67 m không chung ô, nên chạy song song được |
| Chỗ rẽ, đầu plan (robot xoay), 0.45 m cuối (vào bay) | **hình tròn** bán kính 0.40 m = thân xe ở mọi hướng (0.2375) + lệch đường cho phép (0.15) + 0.0125 | robot có thể xoay tại chỗ |
| Zone | chạm khi tâm cách zone < 0.2425 m (nửa dài thân 0.18 + margin 0.05) | đi sát mép zone không khoá cả zone |

### 4.3 Robot đứng yên chiếm những gì (sửa ngày 2026-11-23)

- **Biết hướng xe** (heartbeat có yaw và robot chưa nhận grant mới): hình chữ nhật thân xe theo hướng đó, mỗi bên cộng 5 cm.
- **Chưa biết hướng:** hình tròn 0.2875 m.

Hai parking của V015 cách nhau 0.72 m. Với hình tròn, robot ở parking này chặn đường xoay ra của robot ở parking kia, nên cả hai đứng im mãi.

### 4.4 Chờ và nhường

| Tình huống | Cách xử lý |
|---|---|
| Ô cần đi đang có robot khác giữ | `traffic_plan_reject` (`Capacity`), robot đứng chờ rồi gửi lại plan |
| **Goal đang bận** (robot khác ở đó hoặc đang tới) | `GoalWaitPlaceAsync`: (1) chờ tại chỗ nếu thân xe không chạm ô nào trên đường còn lại của robot kia; (2) nếu không, đi tới **Queue Point gần goal nhất**; (3) nếu không có, đi tới endpoint gần, tối đa 1.5 m |
| Hai robot chờ nhau (vòng chờ → `DEADLOCK_RISK`) | sau 5 s, `ResolveDeadlocksAsync` chọn một robot nhường. Robot sát đích (< 0.6 m) không bao giờ phải nhường. Robot nhường **né sang chỗ trống gần nhất trong 1.2 m** (`YieldSpots`, tìm trên map.pgm). Không có chỗ mới về Queue Point. Né xong thì chờ robot kia qua rồi đi tiếp |
| Robot rảnh đứng chắn | `RobotCareService.YieldIdleBlockersAsync` dời robot đó đi |

### 4.5 Vì sao robot và backend phải tính giống hệt nhau

Gate trên robot dùng chính `geometry` trong grant để tính thân xe đang chạm ô/zone nào. Nếu phép tính hai bên khác nhau, robot sẽ cho rằng mình đang ở ngoài phần được cấp và đứng im.

Ví dụ ngày 2026-11-23: gate kiểm tra zone bằng hình tròn 0.2875 m, còn backend dùng 0.2425 m. Robot đứng cách ZONE-SINGLE-CENTER 0.26 m bị gate coi là đã vào zone, báo `OUTSIDE_RESERVATION` và đứng im mãi.

Để tránh lệch, hai bên dùng chung file test `semantic_cells_vectors.json` và `semantic_oriented_vectors.json`.

---

## 5. Nav2: robot lập đường và bám đường thế nào

| Thành phần | Plugin trong dự án | Việc làm |
|---|---|---|
| **map_server** | bản đồ `map.pgm` + `map.yaml` (5 cm/pixel) | cung cấp bản đồ tĩnh |
| **AMCL** | `amcl.yaml` (300–800 hạt, 60 tia) | định vị trên bản đồ bằng LiDAR, ra `map→odom` |
| **EKF** (robot_localization) | `ekf.yaml` | trộn odom bánh xe với IMU, ra `odom→base_footprint` |
| **Costmap global/local** | Static + Obstacle (LiDAR) + Inflation + **KeepoutFilter** + **SpeedFilter** | bản đồ chi phí: tường, vật cản, vùng cấm, vùng giảm tốc |
| **Planner** | **`warotrans_lane_planner::LaneAwareNavfn`** | A*/Navfn có thêm lane: đi trên lane rẻ hơn (×0.15) và bị kéo về tâm lane (trọng số 12). **Cấm đi ngược lane ONE_WAY**, nhưng cho cắt ngang lane gần vuông góc |
| **Smoother** | SimpleSmoother | làm mượt đường |
| **Controller** | **Regulated Pure Pursuit**, 4 bộ: `FollowPath` (thường, 0.35 m/s), `FollowPathReverse` (lùi vào bay), `FollowPathDock` (vào bay 0.15 m/s), `FollowPathAlign` (xoay chỉnh hướng 0.2 rad/s) | bám đường và sinh `/cmd_vel` |
| **Goal checker** | SimpleGoalChecker (xy 0.08–0.12 m, yaw 5°) | quyết định thế nào là đã tới |
| **Progress checker** | PoseProgressChecker | phát hiện robot không tiến lên |
| **Behaviors** | Spin, BackUp, DriveOnHeading, Wait | phục hồi khi kẹt. Phải có grant mới được chạy (`recovery_guard`) |
| **velocity_smoother** | | giới hạn gia tốc |
| **collision_monitor** | LiDAR, vùng trước/sau | lớp an toàn cuối cùng: thấy vật cản thì cắt vận tốc |
| **bt_navigator** | Behavior Tree XML | điều phối: plan → follow → recover |

**Docking** (`docking_navigator.py`, gateway tự làm, không dùng plugin docking của Nav2):

1. **Exit:** đi thẳng ra khỏi bay đang đứng; nếu xe quay mặt vào bay thì lùi ra.
2. **Travel:** NavigateToPose tới **điểm quay đầu**, cách endpoint ít nhất 0.25 m trên trục của bay.
3. **Run-in:** đi thẳng vào endpoint (`FollowPathDock`, hoặc `FollowPathReverse` khi lùi vào).
4. **Align:** xoay đúng yaw của endpoint (`FollowPathAlign`).

Trước mỗi đoạn `FollowPath`, gateway gửi đường thẳng đó lên traffic để xin grant, giống như với plan của Nav2.

**Vì sao Nav2 và traffic cùng chạy được:**

- **Nav2 trả lời "đi đường nào"**, dựa trên bản đồ, lane và vật cản thấy được.
- **Traffic trả lời "được đi tới đâu"**, dựa trên vị trí của các robot khác.
- Nav2 lập đường trước. Backend chỉ cấp phần đầu đường còn trống, robot đi hết phần đó rồi chờ phần tiếp.
- Nav2 lập lại đường khoảng 1 lần/giây, robot gửi plan mới và backend tính lại.
- Kết quả: **không robot nào vào ô robot khác đang giữ**. Đó là cam kết an toàn chính của hệ thống, harness kiểm tra bằng `capacityBreaches = 0` và `moved_while_gate_closed = False`.

---

## 6. Map: từ web xuống robot

1. Admin vẽ trên web: endpoint (WAYPOINT, PARK, CHARGER, **QUEUE**), lane (cạnh ONE_WAY), zone (SINGLE_OCCUPANCY, NO_STOP, KEEP_OUT, SPEED). Dữ liệu lưu trong schema `navigation`.
2. Publish map.
3. `export-map-snapshot.ps1` chụp DB thành `samples/maps/MAP-…/snapshot.json`.
4. `export_semantic_bundle.py` tạo **bundle** gồm: `map.pgm/yaml`, `lanes.json`, `single_occupancy.json`, `no_stop.json`, `keepout*.pgm/yaml`, `speed.pgm/yaml`, `semantic_manifest.json`. Manifest chứa **fingerprint**.
5. **Backend** đọc bundle từ `Traffic:SemanticMapDirectory`. **Robot** đọc cùng bundle đó: Nav2 dùng map, keepout, speed và lane; gate dùng zone và fingerprint.
6. Fingerprint hai bên phải khớp, nếu không grant bị từ chối. Bài học ngày 2026-11-15: Pi vẫn chạy V004 trong khi backend đã sang V009.

---

## 7. Một số lỗi đã gặp và tầng gây ra lỗi

| Hiện tượng | Tầng | Nguyên nhân |
|---|---|---|
| Robot quay nhanh hơn lệnh 11–19 % | firmware/hardware.yaml | `sep` sai (0.4535 m thay vì 0.396 m) |
| RBT-002 đi chậm khoảng 3 lần | driver RRC Lite | mất gói `set_motor_type`, firmware dùng preset sai |
| RBT-002 chạy giật lùi | driver/URDF | dấu motor bị đảo; LiDAR lắp ngược nhưng khai báo yaw 0 |
| Hướng xe trôi 38° khi đứng yên | EKF | bias gyro chưa được trừ |
| Robot đứng im với `OUTSIDE_RESERVATION` | gate ↔ backend | hai bên tính chạm zone khác nhau |
| Hai robot ở parking chặn nhau mãi | traffic | robot đứng yên được tính chiếm hình tròn, không theo hướng xe |
| Robot nhường đường chạy qua nửa xưởng | engine | retreat chỉ biết chọn endpoint, không biết né tại chỗ |
| `workflow_pickup_endpoint_fixed` | dữ liệu | workflow INBOUND trỏ tới endpoint của map V013 cũ |

---

## 8. Muốn đọc code thì bắt đầu ở đâu

| Muốn hiểu | Đọc file |
|---|---|
| Job chạy từng step | `warotrans-system/backend/src/Modules/WorkflowExecution/Execution/JobExecutionEngine.cs` |
| Chờ goal, chỗ chờ | `…/JobExecutionEngine.WaitPoints.cs` |
| Cấp ô và zone | `…/Modules/Fleet/Traffic/TrafficState.cs`, `SemanticReservation.cs` |
| Né đường | `…/Modules/Fleet/Traffic/YieldSpots.cs` |
| Topic và message MQTT | `…/WaroTrans.BuildingBlocks/Mqtt/RobotMqttTopics.cs`, `Messages/RobotCommandMessage.cs`, `docs/mqtt-robot-contracts.md` |
| Gateway robot | `warotrans/ros2_ws/src/warotrans_fleet/warotrans_fleet/robot_gateway_node.py`, `semantic_traffic_client.py`, `docking_navigator.py` |
| Nav2 config | `warotrans/ros2_ws/src/warotrans_navigation/config/nav2_params.yaml`, `nav2_params_lane_aware.yaml` |
| Lane planner | `warotrans/ros2_ws/src/warotrans_lane_planner/src/lane_aware_navfn.cpp` |
| RBT-001 xuống motor | `warotrans_hardware/esp32_bridge_node.py`, `serial_protocol.py`, `firmware/warotrans_low_level/warotrans_low_level.ino` |
| RBT-002 xuống motor | `warotrans-rbt2/ros2_ws/src/warotrans_rbt002_hardware/base_controller_node.py`, `warotrans_rrc_lite/protocol.py`, `rrc_lite_node.py` |
| Mô phỏng hai robot | `warotrans/tools/traffic_e2e/test_multi_robot_v016_v017.py`, `sim_robot.py`, `map_paths.py` |

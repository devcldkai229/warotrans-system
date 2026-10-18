# Điều khiển robot bằng tay trên web (Manual)

> Trạng thái: **XONG** (2026-10-15), đã kiểm tra trên Gazebo với robot ảo `RBT-SIM-01`.
> Mở: **Monitor → Fleet → chọn robot → Manual**. Trang toàn màn hình `/monitor/fleet/{robot}/manual`.

## 1. Màn hình

Toàn màn hình, bản đồ là nội dung chính, giữ **style sáng của web** (ảnh console công nghiệp chỉ để tham khảo bố cục).

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← RBT-SIM-01 · AVAILABLE · Online · IDLE · (x, y) yaw      [zones]  │
│                                                            [follow] │
│        BẢN ĐỒ TOÀN MÀN HÌNH, robot chạy realtime           [  +   ] │
│     [ Rack A (3.20, 3.75) · hướng ↻ · Go · Cancel · × ]    [  −   ] │
│                                                            [ fit  ] │
│                                                    ▲                 │
│  ( 0.24 )                                      (  ●  )   [≡]         │
│   m/s  ← tốc độ thật                               ▼   (chỉ khi Manual bật)
│        [● Manual]   [● Drive Assist]   🐢 ━━━━●━━ 🐇   [Stop]  ← mở bằng [≡]
└──────────────────────────────────────────────────────────────────────┘
```

**Hai chế độ, chọn bằng công tắc Manual** (trong thanh dưới, mở bằng nút bảng điều khiển [≡]):

| Manual | Di chuyển bằng | Ghi chú |
|---|---|---|
| **Tắt** (mặc định) | **Click trên map**: click sàn hoặc endpoint, chỉnh hướng, **Go** (Nav2 lập đường, tránh kệ), **Cancel** để dừng | Joystick ẩn |
| **Bật** | **Tay**: joystick, ▲ ▼, phím mũi tên / WASD (Space = dừng) | Click map không đặt đích nữa; đích cũ bị xoá |

| Thành phần | Chức năng |
|---|---|
| **Nút bảng điều khiển [≡]** (góc phải dưới) | Mở / đóng thanh điều khiển dưới cùng |
| **Thanh dưới** | Manual, Drive Assist, tốc độ 🐢→🐇 (0.05–0.3 m/s; tốc độ quay tăng theo), Stop |
| **Joystick** | Kéo núm: lên/xuống = tiến/lùi, trái/phải = rẽ, chéo = cả hai, càng xa tâm càng nhanh. Thả tay thì robot dừng |
| **Drive Assist** | Bật (mặc định) thì robot tự giảm tốc rồi dừng trước vật cản theo hướng đang chạy |
| **Đồng hồ** | Tốc độ **thật** của robot (odometry qua SignalR) |
| **Nút phải trên** | Bật/tắt zone, Follow (bản đồ bám theo robot; tự tắt khi bạn kéo bản đồ), zoom +/−, xem toàn bộ map |

## 2. Luồng hệ thống

```
Lái tay:   Web ──POST /teleop {linear, angular, assist} mỗi 200 ms──► Backend ──MQTT teleop (QoS0)──► Gateway
             nhả tay: {0,0}                                                    │ Drive Assist (lidar)
                                                                               ▼
                                                                    Twist ──► /cmd_vel ──► bánh xe
Đi tới điểm: Web ──POST /commands/navigate──► Backend ──MQTT command──► Gateway ──► Nav2 ──► /cmd_vel
Hiển thị:   Gateway telemetry (pose, vận tốc) ──► Backend ──SignalR robotTelemetryUpdated──► Web (5 Hz)
```

## 3. Drive Assist (trên robot, `warotrans_fleet/drive_assist.py`)

1. Mỗi lần có `/scan`, gateway đổi các điểm lidar sang `base_link` qua TF. Trên robot thật lidar được **gắn xoay 90°**, nên không thể dùng thẳng góc 0 của lidar.
2. Xét một **hành lang rộng bằng thân xe** (0.26 m + 5 cm mỗi bên) theo hướng đang chạy (tiến: phía trước; lùi: phía sau). Lấy khoảng trống từ mép xe tới điểm gần nhất.
3. Quy tắc:
   - khoảng trống ≥ 0.6 m: chạy đúng tốc độ yêu cầu;
   - từ 0.15 đến 0.6 m: giảm tốc tuyến tính;
   - ≤ 0.15 m: không tiến thêm.
   Quay tại chỗ và lùi ra xa vẫn được.
4. Kiểm tra lại mỗi 100 ms, kể cả giữa hai lệnh từ web.
5. Không có scan mới quá 0.5 s nghĩa là "không nhìn thấy", nên robot không tiến/lùi.
6. Điểm nằm trong viền thân xe bị coi là lidar quét trúng chính robot và được bỏ qua.

Tham số: `assist_*` trong `config/robot_gateway.yaml`.

## 4. Các lớp an toàn khác của lái tay

| Lớp | Bảo vệ |
|---|---|
| Web | Nhả tay hoặc rời trang, chuyển tab, cửa sổ mất focus đều gửi lệnh dừng |
| Backend `POST /api/fleet/robots/{id}/teleop` | Từ chối chạy khi `robot_disabled` / `robot_offline` / `robot_busy` (đang navigate). Lệnh dừng luôn đi qua. Trần 1.0 m/s, 2.0 rad/s |
| Gateway | Kẹp tốc độ (sim 0.3 m/s, robot thật 0.10 m/s). **Deadman 0.5 s**: mất lệnh thì tự dừng. Bỏ qua khi Nav2 đang chạy goal |

## 5. Thay đổi theo repo

**Backend repo**
- Fleet:
  - `Features/TeleopRobot` (API teleop, có `assist`);
  - `IssueNavigateCommand/Handler.cs` thử lại khi telemetry ghi đè cùng lúc (trước đây bấm Go đôi khi lỗi 500);
  - bản tin SignalR `robotTelemetryUpdated` có thêm `linearVelocity` và `angularVelocity`.
- BuildingBlocks: `RobotTeleopMessage`, `IMqttRobotTeleopPublisher`, topic `teleop`.
- Contract: `docs/mqtt-robot-contracts.md` mục **Teleop**.
- Web:
  - `features/robots/manual/`: `RobotManualPage`, `Joystick`, `Speedometer`, `useTeleopLoop`;
  - route `/monitor/fleet/:robotCode/manual`;
  - trang Fleet: vị trí robot realtime, nút Manual mở trang mới;
  - `WarehouseMap`: zoom điều khiển từ ngoài, `follow`, `yawUnit` (radian từ backend; trước đây mũi tên hướng bị vẽ sai).

**Robot repo**
- `warotrans_fleet`: `teleop.py`, `drive_assist.py`, nối vào `robot_gateway_node.py` (subscribe `teleop`, đọc `/scan`).
- Tham số `teleop_*` và `assist_*` trong `config/robot_gateway.yaml`; sim dùng `robot_gateway_sim.yaml`.

## 6. Kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| pytest gateway | 78 passed (`test_teleop.py`, `test_drive_assist.py`: hành lang, giảm tốc, lidar gắn xoay 90°, kiểm tra lại giữa hai lệnh) |
| Unit test backend | 303 passed · integration 100 passed (4 skip) |
| Gazebo: lái tay | giữ tiến 2 s đi 0.53 m; rẽ trái 1.5 s quay khoảng 115°; deadman tự dừng |
| Gazebo: Drive Assist | giữ tiến 0.3 m/s thẳng vào Rack A trong 8 s → **tự dừng cách kệ 0.21 m**; khi bị chặn vẫn quay tại chỗ được (+93°) |
| Gazebo: Go / Cancel | 6 vòng navigate tới điểm sàn → lái tay bị chặn `robot_busy` → cancel, tất cả đúng; đi tới (2.5, 6.0) trong 26 s |

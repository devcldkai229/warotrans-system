# GĐ 2 — Backend nhận robot ảo và điều khiển nó qua API

> Trạng thái: **XONG** (2026-10-15), nhánh `feature/simulation-robot-workflow`.
> Kết quả: `POST /api/fleet/robots/{id}/commands/navigate` → robot trong Gazebo chạy tới kệ → lệnh `COMPLETED / SUCCEEDED`.
> GĐ 0–1 (môi trường + robot ảo): xem robot repo `docs/simulation/00-*.md`, `01-*.md`.

Đây là **mốc mức 1**: backend điều khiển được robot ảo đúng như sẽ điều khiển robot thật.
**Không sửa dòng code backend nào.** Chỉ thêm dữ liệu (kho, map, endpoint, robot) và script.

## 1. Backend cần biết gì về robot ảo

Backend không "nhìn" Gazebo. Nó chỉ biết 4 loại dữ liệu nghiệp vụ, và GĐ 2 tạo đủ 4 loại đó:

| Dữ liệu | Module | Lấy từ đâu | Tạo bằng |
|---|---|---|---|
| Warehouse `WH-SIM` | Warehouse | cố định | `00-seed.sim-warehouse.sql` (chưa có API tạo kho) |
| MapVersion `MAP-WHSIM-V001` | Navigation | `maps/sim_warehouse.pgm + .yaml` của robot repo | `POST /api/navigation/warehouses/{id}/maps/import` → `POST .../publish` |
| Endpoint A–F, PARK | Navigation | `config/sim_endpoints.json` của robot repo | `POST /api/navigation/maps/{id}/endpoints` (lúc map còn DRAFT) |
| Robot `RBT-SIM-01` | Fleet | trùng `robot_code` của gateway sim | `POST /api/fleet/robots` (map phải PUBLISHED) |

Map và endpoint đều sinh từ **cùng một file layout** (`warehouse_layout.yaml`) với world Gazebo. Vì vậy toạ độ
endpoint `EP-KE-D = (10.25, 6.3, 0)` trong DB chính là điểm đậu trước kệ D trong Gazebo, cùng frame `map`.

```
robot repo: warehouse_layout.yaml ──generate──► world Gazebo   (robot ảo chạy trong đó)
                                            ├─► sim_warehouse.pgm/.yaml ──import──► MapVersion MAP-WHSIM-V001
                                            └─► sim_endpoints.json      ──create──► Endpoint EP-KE-A … EP-BAI-DO
```

## 2. Một lệnh MOVE đi qua toàn hệ thống

```
navigate-sim.ps1 / (sau này: Job engine GĐ 3)
   │ POST /api/fleet/robots/{id}/commands/navigate {x,y,yaw,frameId:"map"}
   ▼
Fleet IssueNavigateCommandHandler
   ├─ kiểm tra: robot enabled, online, không có lệnh đang chạy
   ├─ lưu RobotCommand (status SENT), Robot.Status = EXECUTING
   └─ MqttRobotCommandPublisher ──► Mosquitto: warotrans/v1/robots/RBT-SIM-01/command        (HTTP trả 202)
                                         │
                                         ▼  (WSL2) robot_gateway_node → Nav2 → Gazebo (GĐ 1)
                                         │
Mosquitto ◄── command_ack {accepted:true} ┤      → ProcessRobotCommandAck:    SENT → RUNNING (acked_at)
Mosquitto ◄── telemetry 5 Hz {pose, nav}  ┤      → ProcessRobotTelemetry:     Robot.PoseX/Y/Yaw, NavigationStatus
                                         │                                    + SignalR "robotTelemetryUpdated"
Mosquitto ◄── command_result SUCCEEDED ───┘      → ProcessRobotCommandResult: RUNNING → COMPLETED (outcome SUCCEEDED)
                                                                              Robot.Status = AVAILABLE
                                                   + integration event RobotCommandLifecycleChanged
                                                     (GĐ 3: JobStep tương ứng → COMPLETED)
```

Ngoài ra, mỗi giây gateway gửi `heartbeat`, và backend dùng nó để giữ `Robot.IsOnline = true`. Mất heartbeat 5 s thì robot
offline. Nếu đang có lệnh chạy thì lệnh bị abort.

## 3. Cách chạy (4 terminal)

```powershell
# 1) Hạ tầng
cd infrastructure; docker compose up -d

# 2) Backend cho sim (MQTT ép IPv4, xem mục 5)
powershell -ExecutionPolicy Bypass -File samples/simulation/run-backend-sim.ps1

# 3) Seed kho/map/endpoint/robot (chạy lại được, không tạo trùng)
powershell -ExecutionPolicy Bypass -File samples/simulation/seed-sim.ps1

# 4) Robot ảo với mã map của backend (thêm rviz:=true / gui:=false tuỳ ý)
wsl -d Ubuntu-24.04 -- bash /mnt/d/WaroTransSim/scripts/run-sim.sh

# 5) Backend ra lệnh
powershell -ExecutionPolicy Bypass -File samples/simulation/navigate-sim.ps1 -To D,A,PARK
```

`seed-sim.ps1` ghi `samples/simulation/sim-config.json` (id kho, map, robot, endpoint) để các script sau dùng.

## 4. Kết quả kiểm chứng (2026-10-15)

Seed:

```
import map (yaml + pgm) -> 201 · 7 endpoint -> 201 · publish map -> 200 · register robot -> 201
map MAP-WHSIM-V001 (PUBLISHED) · robot RBT-SIM-01
chạy lại: "reuse PUBLISHED MAP-WHSIM-V001 (same content hash)" · "reuse robot" · WH-SIM vẫn 1 map version
```

Backend điều khiển robot ảo (`navigate-sim.ps1 -To D,A,PARK`):

| Lệnh | RobotCommand | Thời gian | Pose cuối (backend lưu từ telemetry) |
|---|---|---|---|
| → D `EP-KE-D` | `COMPLETED / SUCCEEDED` | 35 s | (10.17, 6.37) |
| → A `EP-KE-A` (quay đầu 180°) | `COMPLETED / SUCCEEDED` | 35 s | (1.88, 6.34) |
| → PARK `EP-BAI-DO` | `COMPLETED / SUCCEEDED` | 28 s | (5.88, 0.84) |

Trước khi ra lệnh, backend thấy robot `isOnline = true`, `localizationStatus = LOCALIZED`, `mapVersionCode = MAP-WHSIM-V001`.

## 5. Sự cố đã gặp và cách xử lý

**Lệnh đầu tiên bị `TIMEOUT / ACK_TIMEOUT` dù robot vẫn chạy.**
- Gateway nhận lệnh trễ ~22 s so với lúc backend phát.
- Nguyên nhân: `Mqtt:Host = "localhost"`. Trên máy này `localhost` phân giải ra **`::1` (IPv6) trước**, mà
  Mosquitto (Docker Desktop, WSL2 mirrored) không nhận IPv6. `MqttRobotCommandPublisher` kết nối lười (lúc phát
  lệnh đầu tiên), nên treo **21 s** (TCP timeout của Windows) rồi mới sang `127.0.0.1` (82 ms). Trễ hơn ACK timeout 10 s.
- Xử lý: `run-backend-sim.ps1` đặt `Mqtt__Host=127.0.0.1` bằng biến môi trường. **Không** sửa `appsettings.json` chung.
- Đề xuất cho team: đổi mặc định thành `127.0.0.1`, hoặc cho publisher kết nối sẵn lúc khởi động.

**Quan sát chưa xử lý (ngoài phạm vi GĐ 2):**
- Khi lệnh timeout, log có `DbUpdateConcurrencyException`: bộ giám sát timeout và telemetry cùng cập nhật một Robot.
  Nên xem lại khi làm GĐ 3.
- Ngay sau khi khởi động lại backend có một lần `POST navigate` bị từ chối. Không tái hiện được ở các lần sau, và
  chưa đọc được nội dung lỗi.
- Robot đổi map: Fleet chưa có API đổi `CurrentMapVersionId`. `seed-sim.ps1` cập nhật bằng SQL (chỉ dùng cho dev)
  khi map sim được import lại với nội dung mới.

## 6. File (backend repo)

| File | Vai trò |
|---|---|
| `samples/simulation/00-seed.sim-warehouse.sql` | Warehouse `WH-SIM` |
| `samples/simulation/seed-sim.ps1` | Import map, tạo endpoint, publish, đăng ký robot, ghi `sim-config.json` |
| `samples/simulation/navigate-sim.ps1` | Backend ra lệnh tới endpoint, theo dõi pose + trạng thái lệnh |
| `samples/simulation/run-backend-sim.ps1` | Chạy backend với MQTT IPv4 |
| `samples/simulation/sim-common.ps1` | Helper gọi API / psql dùng chung |
| `samples/simulation/sim-config.json`, `responses/` | Kết quả seed / chạy thật |

## 7. GĐ 3 — XONG, xem [03-job-engine-robot-ao.md](03-job-engine-robot-ao.md)

Hiện người (script) ra từng lệnh MOVE. GĐ 3 làm **bộ máy chạy Job** trong backend: từ một TransportRequest đã
queue, tự gán `RBT-SIM-01`, đi qua từng JobStep. Bước MOVE gọi đúng API/luồng ở mục 2 (kèm `jobStepId`), bước
PICKUP_CONFIRM / DROPOFF_CONFIRM chờ nhân viên xác nhận qua API, rồi chạy tiếp tới hết workflow.

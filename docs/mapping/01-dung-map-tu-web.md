# Dựng map từ web (Luồng 1)

Ngày: 2026-11-24. Nhánh `feature/web-map-building` ở cả ba repo: `warotrans-system`, `warotrans` (RBT-001), `warotrans-rbt2` (RBT-002).

## 1. Luồng

**Configure → Facility → Dựng map → chọn robot rảnh → lái robot trên web → Hoàn tất → map DRAFT → trình chỉnh map.**

Trước đây, muốn có map mới phải SSH vào Pi và làm tay:

1. Dừng stack điều hướng.
2. Chạy `mapping.launch.py`.
3. Lái robot bằng web teleop riêng (cổng 8080).
4. Chạy `save_map.sh`.
5. Chép `map.pgm` và `map.yaml` về máy, rồi import trên trang Facility.

Bây giờ toàn bộ việc đó làm trên web. Robot vẫn giữ kết nối MQTT với backend suốt quá trình.

## 2. Thiết kế

```
Web (trang Dựng map)          Backend (Fleet)                          Robot gateway
─────────────────────         ───────────────────────────              ──────────────────────────────────
Chọn robot ──POST sessions──► MappingSession STARTING
                              START_MAPPING {sessionId} ──MQTT──►      PAUSE lifecycle_manager_localization
                                                                       (AMCL + map_server tắt)
                                                                       chạy slam_toolbox (map → /mapping/map)
                                                                       chờ map đầu tiên → SUCCEEDED
                              ◄── command_result ──────────            telemetry: mapVersionCode = MAPPING
                              MAPPING
Joystick ──teleop + lease──►  (đường lái tay sẵn có)       ──MQTT──►   teleop chỉ nhận khi đang MAPPING,
                                                                       luôn bật Drive Assist, mở cổng authority
Canvas ◄── GET preview 1 s ── MappingLiveStore ◄── robots/{code}/mapping (pose ~1 s, lưới thu nhỏ ~2 s)
Hoàn tất ──POST finish──────► SAVING
                              STOP_MAPPING {save:true} ──MQTT──►       map.pgm + map.yaml (trinary như map_saver),
                                                                       lưu cả pose graph trên robot,
                              ◄── robots/{code}/mapping_upload ──      gửi theo chunk (zlib + base64, ≤ 128 KB/gói)
                              ghép chunk, kiểm sha256,                 dừng slam, RESUME AMCL + map_server
                              import → MapVersion DRAFT                robot báo UNKNOWN đến khi được định vị lại
                              COMPLETED
Tự mở trình chỉnh map ◄──
```

### 2.1 Robot (`warotrans_fleet`, dùng chung cho RBT-001 và RBT-002)

| File | Vai trò |
|---|---|
| `mapping_session.py` | Logic thuần, không phụ thuộc ROS: `MappingController` (IDLE → STARTING → MAPPING → STOPPING), lệnh `START_MAPPING` và `STOP_MAPPING`, chuyển lưới sang PGM/YAML, chia chunk, preview |
| `mapping_ros.py` | Phần ROS: `manage_nodes` PAUSE/RESUME, chạy `ros2 launch warotrans_slam slam.launch.py` thành một process group riêng, subscribe `/mapping/map`, `slam_toolbox/serialize_map` |
| `robot_gateway_node.py` | Đăng ký hai lệnh; teleop trong lúc dựng map; `authority_ok` khi dựng map; telemetry `MAPPING`; sau khi dựng map, robot buộc phải được định vị lại |
| `amcl_readiness.py` | Thêm `reset()`: bỏ pose do người vận hành đặt trước khi dựng map |

**Tham số mới của gateway** (đều có giá trị mặc định, nên không bắt buộc khai báo):

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `mapping_enabled` | `true` | Bật hai lệnh dựng map |
| `mapping_map_topic` | `/mapping/map` | slam_toolbox phát map lên topic này (`map_name`), nên map vận hành `/map` của map_server, costmap và AMCL không bị ảnh hưởng |
| `mapping_localization_manager` | `lifecycle_manager_localization` | Lifecycle manager của map_server và AMCL. Để trống nếu stack không có |
| `mapping_slam_params_file` | `""` | Để trống thì dùng `warotrans_slam/config/slam_toolbox.yaml`. Gateway chép file params ra một bản tạm, ghi đè `mode: mapping`, `map_name` và `use_sim_time` |
| `mapping_local_dir` | `~/maps/mapping_sessions` | Robot giữ một bản `map.pgm`, `map.yaml`, `posegraph.*` và log slam_toolbox ở `<dir>/<sessionId>/` |
| `mapping_first_map_timeout_sec` | `30` | Thời gian tối đa chờ slam_toolbox ra map đầu tiên |
| `mapping_preview_period_sec` / `mapping_map_every_sec` | `1` / `2` | Nhịp gửi pose và nhịp gửi lưới |

**An toàn:**

- **Lái tay:**
  - Cấu hình fleet của robot thật có `teleop_enabled: false`, vì teleop đi thẳng vào `cmd_vel_safe` và bỏ qua collision_monitor.
  - Gateway chỉ nhận lệnh lái tay khi phiên đang ở trạng thái MAPPING, và luôn ép bật **Drive Assist** (hành lang lidar dừng robot trước vật cản).
  - Trong lúc đó, gateway giữ cổng authority mở (20 Hz, theo đồng hồ thật), nhưng STOP vẫn thắng.
  - Khi phiên kết thúc, gateway đóng cổng và gửi Twist 0.
- **Từ chối lệnh khác:** trong lúc dựng map, gateway từ chối LOCALIZE / AUTO_LOCALIZE, và START bị từ chối khi robot đang chạy MOVE hoặc AUTO_LOCALIZE.
- **Telemetry:** báo `mapVersionCode = "MAPPING"` và `localizationStatus = UNKNOWN`, nên dispatch không giao việc (lý do mới `robot_mapping`, cùng với `robot_reported_map_mismatch` và `robot_not_localized`).
- **Sau phiên (lưu hay huỷ):**
  - Robot phải được định vị lại: `AmclReadiness.reset()` và cờ `_relocalize_required`. Robot báo UNKNOWN cho tới khi có `/initialpose` mới (LOCALIZE, AUTO_LOCALIZE hoặc RViz).
  - Lý do: AMCL chạy lại với pose cũ, nhưng robot đã đi chỗ khác.
- **Lỗi khi lưu:**
  - Gửi map thất bại (hàng đợi MQTT đầy, chưa có map) thì phiên **vẫn mở**, để thử lại hoặc huỷ.
  - Gateway tắt thì slam_toolbox cũng tắt theo.

### 2.2 Backend (`warotrans-system`)

| Thành phần | Nội dung |
|---|---|
| `MappingSession` (`fleet.mapping_sessions`) + migration `AddMappingSessions` | Trạng thái STARTING / MAPPING / SAVING / CANCELLING / COMPLETED / CANCELLED / FAILED. Index unique đảm bảo mỗi robot chỉ có một phiên mở |
| `MappingService` | `StartAsync`, `FinishAsync`, `CancelAsync`, `GetAsync`, `ListAsync`, `PreviewAsync`, `OnUploadChunkAsync`. Hàm thuần `Advance(session, robot, start, stop, now)` tính trạng thái tiếp theo từ kết quả của hai lệnh |
| `MappingLiveStore` (singleton, trong bộ nhớ) | Giữ pose mới nhất và lưới gần nhất của từng robot; ghép chunk theo phiên, kiểm sha256, giải nén zlib |
| `MappingSessionMonitor` | Cứ 3 giây đẩy các phiên đang mở sang trạng thái tiếp theo, kể cả khi không ai mở trang |
| `IScannedMapImporter` (Navigation) | Dùng lại đúng đường import PGM + YAML: kiểm tra, ảnh preview, asset store, tạo version **DRAFT** |
| MQTT | Hai topic mới: `robots/+/mapping` (QoS 0) và `robots/+/mapping_upload` (QoS 1) |
| Dispatch / auto-localize | Thêm lý do `robot_mapping`; AUTO_LOCALIZE từ chối robot đang dựng map (`robot_mapping`) |

**API** (`/api/fleet`):

| Method | Đường dẫn | Quyền |
|---|---|---|
| GET | `/mapping/robots?warehouseId=` (robot kèm lý do không dùng được) | `map.write` |
| GET | `/mapping/sessions?warehouseId=&open=true` | `map.read` |
| POST | `/mapping/sessions` `{ robotId }` | `map.write` (có audit) |
| GET | `/mapping/sessions/{id}`, `/mapping/sessions/{id}/preview` | `map.read` |
| POST | `/mapping/sessions/{id}/finish` `{ name }` | `map.write` (có audit) |
| POST | `/mapping/sessions/{id}/cancel` | `map.write` (có audit) |

Lái tay dùng lại `POST /robots/{id}/manual/lease` và `POST /robots/{id}/teleop` (quyền `robot.manual.drive`).

**Các trường hợp lỗi:**

| Tình huống | Kết quả |
|---|---|
| Gateway cũ chưa hỗ trợ lệnh | FAILED `mapping_unsupported` |
| START không có trả lời sau 90 giây | FAILED `mapping_start_timeout` |
| Gateway khởi động lại giữa chừng (telemetry báo map khác quá 20 giây) | FAILED `mapping_lost` |
| Robot offline quá 10 phút | FAILED `robot_offline` |
| Lưu thất bại trên robot | Phiên về lại MAPPING, kèm `errorCode` |
| Robot gửi xong mà map không về đủ trong 60 giây | FAILED `mapping_upload_incomplete` (map vẫn còn trên robot ở `robotPath`) |

### 2.3 Web

- **Trang Facility:**
  - Nút **Dựng map** ở đầu trang mở hộp chọn robot: robot nào không dùng được thì có lý do kèm theo, robot đang có phiên dở thì có nút "Tiếp tục".
  - Thanh xanh "RBT-001 đang dựng map…" giúp quay lại phiên sau khi tải lại trang.
  - Nút cũ "Dựng map" trên thẻ map đã publish thực ra chỉ tải route-graph GeoJSON, nên đổi tên thành **Tải route graph**.
- **Trang `/configure/facility/mapping/:sessionId`:**
  - Bên trái: canvas vẽ map đang dựng (tường đen, ô trống trắng, ô chưa biết xám), mũi tên robot và vệt đường đã đi.
  - Bên phải: trạng thái, thời gian, diện tích đã quét, joystick, phím mũi tên / WASD, Space để dừng, chọn tốc độ (0,05–0,2 m/s).
  - Phía dưới: tên map, nút **Hoàn tất và lưu**, nút **Huỷ dựng map**.
  - Lưu xong, trang tự mở map DRAFT mới trong trình chỉnh map.
- Lưới nhận về được giải nén bằng `DecompressionStream('deflate')` của trình duyệt (`mappingGrid.ts`).

## 3. Hai robot

| | RBT-001 (`warotrans`) | RBT-002 (`warotrans-rbt2`) |
|---|---|---|
| Code dựng map | `warotrans_fleet` (viết ở đây) | Chép nguyên bằng `tools/sync_from_rbt1.py` (ghi trong `UPSTREAM.md`, 2026-11-24) |
| Cấu hình gateway | `warotrans_fleet/config/robot_gateway_semantic.yaml` | `warotrans_rbt002_bringup/config/rbt002/robot_gateway_rbt002.yaml` |
| Localization | `warotrans_localization/localization.launch.py` (`lifecycle_manager_localization`) | Giống RBT-001 (`fleet.launch.py` include cùng file) |
| slam_toolbox | `warotrans_slam` | `warotrans_slam` (core chép sang). Pi đã cài `ros-jazzy-slam-toolbox` |

**Lần sync này mang sang RBT-002 cả các thay đổi core đã có trên RBT-001 từ lần sync trước**, gồm costmap uplink, MQTT TLS, hạn lệnh, auto-localize… `navigation.launch.py` lấy bản đã commit, không mang thay đổi local chưa commit của RBT-001.

**Triển khai lên Pi:** deploy như thường lệ, build lại `warotrans_fleet`, rồi khởi động lại stack fleet. Không cần chạy `mapping.launch.py` nữa.

## 4. Lưu ý khi dùng

- Map mới có **hệ toạ độ mới**: gốc là vị trí odom lúc robot bắt đầu. Endpoint, zone, lane phải đặt lại trong trình chỉnh map, không chép từ map cũ.
- **Lái chậm**, dọc theo tường, và quay lại chỗ xuất phát để slam_toolbox khép vòng.
- Sau phiên dựng map, robot vẫn gán map cũ và chưa định vị. Hãy định vị lại, hoặc publish map mới, đổi map cho robot rồi tự định vị.
- Publish map và tạo semantic bundle vẫn làm theo `warotrans/tools/switch_map.md`. Luồng này dừng ở bước có map DRAFT.

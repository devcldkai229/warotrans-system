# Đổi map nhanh và tự định vị robot (AMCL, slam_toolbox)

Ngày: 2026-11-23. Nhánh: `feature/robot-map-auto-localize`, ở cả `warotrans-system` và repo robot `warotrans`.

## 1. Bài toán

Trước đây, muốn robot chạy trên một map mới phải làm hai việc bằng tay:

1. **Gán map mới cho robot.** Backend đã có API `PUT /api/fleet/robots/{id}/map`, nhưng web không có nút nào gọi nó.
2. **Định vị lại.** Người vận hành đặt robot lên một endpoint, chọn endpoint đó trên web (lệnh `LOCALIZE`), robot đẩy pose đó ra `/initialpose` cho AMCL.

Sau khi đổi map, định vị của robot chuyển về `UNKNOWN` (pose cũ thuộc map cũ). Dispatch không giao Job cho robot chưa `LOCALIZED`, nên robot đứng yên cho tới khi có người định vị lại.

Có thêm hai điểm dễ nhầm:

- Mục Identity của robot chỉ hiện mã map **do robot tự báo** trong telemetry, chứ không phải map backend gán cho robot.
- Nếu robot báo một map khác map được gán, dispatch từ chối robot (`ReportedMapMismatch`), nhưng web không cảnh báo gì.

## 2. Đã làm gì

### 2.1 Đổi map nhanh (web)

| Chỗ | Làm gì |
|---|---|
| Panel robot, nút **Đổi bản đồ** | Liệt kê các map PUBLISHED của kho robot. Chọn một map rồi bấm **Chuyển sang MAP-…**. Đổi xong, hệ thống gửi lệnh tự định vị ngay và mở khung **Định vị lại** để theo dõi. Nút bị khoá khi không có quyền `robot.manage` hoặc robot đang chạy lệnh. |
| Trang Fleet, thông báo vàng | Hiện khi có robot của kho không nằm trên map PUBLISHED: "N robot chưa ở bản đồ đã xuất bản … **Chuyển tất cả sang MAP-…**". Bấm một lần là chuyển hết và tự định vị từng robot đang online. Robot nào không chuyển được thì được nêu tên kèm lý do. |
| Mục Identity | "Phiên bản map hiện tại" giờ là **map được gán**. Khi robot báo map khác, có thêm dòng **Bản đồ robot báo** (màu vàng) và câu cảnh báo robot sẽ không nhận Job. |

Backend không cần sửa phần này, vì đã có API `PUT /robots/{id}/map` (chỉ nhận map PUBLISHED cùng kho, từ chối khi robot đang chạy lệnh).

### 2.2 Tự định vị (`AUTO_LOCALIZE`)

Nguyên tắc: **định vị sai nguy hiểm hơn chưa định vị.** Robot chỉ tự nhận một vị trí khi chắc chắn. Khi không chắc, robot đưa ra gợi ý để người xác nhận bằng một cú bấm.

```
Web "Tự định vị" ──POST auto-localize──► Backend
                                          │ dựng ứng viên: pose cuối trên map này, endpoint nhà, mọi endpoint
                                          ▼
                                   MQTT command AUTO_LOCALIZE
                                          ▼
Robot gateway (worker thread, không chặn MQTT):
  1. Lấy /map và một scan mới.
  2. So khớp scan quanh từng ứng viên (±0,3 m, quay đủ 360°), rồi tinh chỉnh.
  3. Quét thô TOÀN map: còn chỗ nào khác khớp gần bằng không?
  4. Chắc chắn (điểm ≥ 0,55, cách biệt ≥ 0,12, chỗ tốt nhất nằm gần một ứng viên)
       → /initialpose → chờ AMCL hội tụ → SUCCEEDED (CANDIDATE_MATCH)
     Không chắc, và người đã cho phép xoay
       → AMCL reinitialize_global_localization + xoay 1 vòng tại chỗ → chờ hội tụ
       → kiểm tra lại pose bằng đúng phép so khớp ở trên → SUCCEEDED (GLOBAL_SPIN) hoặc FAILED
     Còn lại
       → FAILED (LOCALIZATION_AMBIGUOUS / NO_MATCH …) + 3 gợi ý tốt nhất
                                          ▼
                         command_result.result ──► robot_commands.result_json
                                          ▼
Web hiện kết quả. Mỗi gợi ý có nút "Robot đang ở đây" → LOCALIZE tại đúng pose đó.
```

**Chấm điểm một pose** (`scan_match_localizer.py`) dựa trên hai bằng chứng:

- **Đầu tia rơi gần tường.** Lấy trung bình độ khớp của các đầu tia trên "likelihood field" (khoảng cách từ mỗi ô tới tường gần nhất).
- **Tia không xuyên qua tường.** Tia nào trên đường đi cắt qua tường bị trừ điểm gấp đôi. Đây là bằng chứng giúp phân biệt một góc phòng với góc đối diện của nó. Chỉ dựa vào đầu tia thì cả hai góc đều khớp tới khoảng 0,8–0,9.

**Vì sao cần quét toàn map?** Khi robot thật không đứng gần ứng viên nào, một chỗ trông giống vẫn có thể đạt điểm cao. Quét thô toàn map (bước 0,15 m, 15°) cho biết chỗ khớp nhất thật sự nằm ở đâu. Nếu chỗ đó không gần ứng viên nào, kết quả là `NO_MATCH`, kèm gợi ý loại `GLOBAL` đúng chỗ robot đứng.

**Vì sao sau khi xoay vẫn phải kiểm tra lại?** AMCL có thể hội tụ về một góc đối xứng mà covariance vẫn nhỏ. Vì vậy pose sau khi xoay phải qua đúng phép so khớp của ứng viên, có cả bước quét toàn map.

### 2.3 Tự kích hoạt (tuỳ chọn, mặc định tắt)

`FleetLocalization:AutoOnConnect=true` bật dịch vụ nền `AutoLocalizeHostedService`. Cứ 5 giây, dịch vụ gửi `AUTO_LOCALIZE` cho các robot thoả **tất cả** điều kiện:

- online, enabled, chưa `LOCALIZED`;
- không có lệnh đang chạy, không đang bảo trì, không ai đang lái tay;
- telemetry mới (≤ 10 giây).

Giới hạn gửi lại:

- Lần trước thành công: chờ ít nhất 60 giây mới gửi lần nữa.
- Lần trước thất bại: chờ 600 giây, vì cần người xem.
- **Đổi map: thử ngay**, bất kể lần trước ra sao.

Lần chạy tự động **không bao giờ xoay robot**, trừ khi bật thêm `FleetLocalization:AutoAllowSpin=true`. Lệnh chạy quá 120 giây không có kết quả thì bị đóng với trạng thái TIMEOUT.

### 2.4 slam_toolbox (chọn bộ định vị)

- `warotrans_localization/launch/slam_localization.launch.py`: chạy `localization_slam_toolbox_node` (lifecycle). Launch dùng lại `warotrans_slam/config/slam_toolbox.yaml`, chỉ ghi đè `mode: localization` và `map_file_name` (pose graph).
- `warotrans_bringup/launch/navigation.launch.py` có thêm tham số `localizer:=amcl|slam_toolbox` và `slam_posegraph:=<đường dẫn không có đuôi>`.
- Gateway: đặt `localizer: slam_toolbox` và `amcl_pose_topic: /pose`. Tự định vị khi đó chỉ so khớp scan và đưa gợi ý, **không xoay**, vì slam_toolbox không có global localization.
- **Điều kiện để dùng được:** phải có pose graph lưu lúc dựng map:
  ```
  ros2 service call /slam_toolbox/serialize_map slam_toolbox/srv/SerializePoseGraph "{filename: '$HOME/maps/map_one_v019/posegraph'}"
  ```
  Bundle `map_one_v019` hiện **chưa có** pose graph. Cần một phiên dựng map bằng slam_toolbox trên robot thật. Khi thiếu pose graph, launch dừng và báo rõ lý do.

## 3. Các file chính

**Backend (`warotrans-system`)**

| File | Nội dung |
|---|---|
| `Fleet/Enums/RobotCommandType.cs`, `BuildingBlocks/Mqtt/Messages/RobotCommandMessage.cs` | Thêm loại lệnh `AUTO_LOCALIZE` |
| `Fleet/Entities/RobotCommand.cs` + migration `AddRobotCommandResultJson` | Thêm cột `result_json` (jsonb) lưu `command_result.result` của mọi lệnh |
| `ProcessRobotCommandResultHandler.cs` | Lưu `result` khi robot gửi kết quả |
| `RobotControl/RobotControlService.AutoLocalize.cs` | `AutoLocalizeAsync`, `LocalizeAtPoseAsync`, `GetAutoLocalizeAsync`, `BuildCandidates`, `ToAutoLocalizeStatus` |
| `RobotControl/AutoLocalizeHostedService.cs` | `AutoLocalizeOptions` (`FleetLocalization`) và quy tắc `Due` |
| `RobotControl/Endpoints.cs` | `POST /robots/{id}/commands/auto-localize`, `GET /robots/{id}/auto-localize`. `POST …/localize` nhận thêm `{x, y, yaw}` |

**Web**

- `shared/api/fleet.ts`
- `features/robots/AutoLocalizeSection.tsx`, `ChangeMapPanel.tsx`, `OffMapBanner.tsx`, `robotMaps.ts` (+ test)
- `RobotDetailPanel.tsx`, `FleetPage.tsx`
- Bản dịch tiếng Việt và mã lỗi mới.
- Xoá dòng trùng `'Zones'` trong `vi/operations-robots.ts`. Dòng này có sẵn trên develop và làm `tsc` báo lỗi.

**Robot (`warotrans/ros2_ws/src`)**

| File | Nội dung |
|---|---|
| `warotrans_fleet/scan_match_localizer.py` | So khớp scan bằng Python thuần (không cần numpy hay ROS) |
| `warotrans_fleet/auto_localize.py` | `AutoLocalizeCommandHandler` |
| `warotrans_fleet/auto_localize_ros.py` | Phần ROS: `/map`, `/scan`, dịch vụ AMCL, xoay, TF |
| `robot_gateway_node.py` | Đăng ký handler. Các tham số: `auto_localize_enabled`, `localizer`, `auto_localize_map_topic` (`map`), `auto_localize_scan_topic` (`scan`), `global_localization_service`, `auto_localize_spin_speed` (0,35 rad/s), `auto_localize_cmd_vel_topic`, `auto_localize_converge_timeout_sec` |
| `warotrans_simulation/launch/multi_sim_map_one.launch.py` | Thêm `auto_localize_cmd_vel_topic: cmd_vel`. Trong mô phỏng `cmd_vel_safe` đi qua cổng traffic, nên xoay tại chỗ phải đi thẳng ra `cmd_vel` |
| `warotrans_localization/launch/slam_localization.launch.py`, `warotrans_bringup/launch/navigation.launch.py`, `warotrans_localization/package.xml` | Phần slam_toolbox |

## 4. An toàn

- Robot chỉ tự nhận vị trí khi chắc chắn. Ngưỡng điểm, cách biệt và bước quét toàn map đều nhằm tránh nhận nhầm chỗ.
- Chỉ xoay khi người bấm cho phép. Không xoay khi robot đang STOP / PAUSE hoặc có vật cản gần hơn 0,22 m. Vật cản xuất hiện trong lúc xoay thì robot dừng xoay ngay.
- Bị từ chối khi robot đang chạy MOVE, đang có một lượt tự định vị khác, hoặc đang được lái tay.
- Gateway cũ chưa hỗ trợ lệnh sẽ từ chối với lý do `UNSUPPORTED_COMMAND`, và web giải thích là cần cập nhật gateway.

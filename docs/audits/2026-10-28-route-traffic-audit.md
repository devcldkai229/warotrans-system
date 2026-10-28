# Audit: Map → Route graph → Routing → Traffic → Reservation → Robot

**Ngày:** 2026-10-28
**Phạm vi:**
- `warotrans-system`: web map editor, backend Navigation / Fleet / WorkflowExecution.
- `warotrans`: ROS 2 Jazzy, các package `warotrans_fleet`, `warotrans_navigation`, `warotrans_simulation`.

**Trigger:** Trên Gazebo (map `MAP-WHSIM-V018`, robot `RBT-SIM-01`) robot bám lane nhưng đi lượn như sóng hình sin, lệch khỏi đường tâm, có lúc xoay vòng hoặc dừng.

**Phương pháp:**
- Đọc code end-to-end. Không sửa code trong lúc audit.
- Phân tích file `route_graph_v018.geojson`.
- Đối chiếu với bằng chứng E2E ngày 27/10: trace pose 5 Hz, tham số RPP đọc trực tiếp từ node đang chạy, costmap live, log MQTT.

**Quy ước:**
- ✅ = đã xác minh trực tiếp (đọc code hoặc dữ liệu, hoặc đo khi chạy).
- 🔎 = suy luận từ code hoặc lý thuyết, cần đo để xác nhận.
- Đường dẫn backend tương đối với `warotrans-system/backend/src/`. Đường dẫn robot tương đối với `warotrans/ros2_ws/src/`.

---

## Mục lục
1. [Tóm tắt điều hành](#1-tóm-tắt-điều-hành)
2. [Luồng dữ liệu end-to-end](#2-luồng-dữ-liệu-end-to-end)
3. [Vì sao robot đi hình sin](#3-vì-sao-robot-đi-hình-sin)
4. [Phát hiện theo tầng](#4-phát-hiện-theo-tầng)
   - 4.1 [Dựng map & route graph](#41-dựng-map--route-graph)
   - 4.2 [Routing planner](#42-routing-planner)
   - 4.3 [Traffic segmentation & reservation](#43-traffic-segmentation--reservation)
   - 4.4 [Robot: path & điều khiển](#44-robot-path--điều-khiển)
   - 4.5 [Hình học map V018](#45-hình-học-map-v018)
5. [Những gì đã sửa ngày 27/10](#5-những-gì-đã-sửa-ngày-2710)
6. [Lộ trình sửa đề xuất](#6-lộ-trình-sửa-đề-xuất)
7. [Kế hoạch kiểm chứng](#7-kế-hoạch-kiểm-chứng)
8. [Phụ lục](#8-phụ-lục)

---

## 1. Tóm tắt điều hành

### 1.1 Quỹ đạo hình sin: ba nguyên nhân cộng hưởng

| # | Nguyên nhân | Đóng góp | Trạng thái |
|---|---|---|---|
| A | **Vòng điều khiển Regulated Pure Pursuit (RPP) quá gắt.** `lookahead_dist` và `curvature_lookahead_dist` = 0.20 m trong khi `desired_linear_vel` = 0.35 m/s (overlay sim). Tỉ số v/L = 1.75 s⁻¹ gấp khoảng 5 lần tuning đã kiểm chứng trên robot thật (0.10 m/s, 0.30 m). Mô hình tuyến tính cho dao động riêng ω≈2.5 rad/s, tức chu kỳ khoảng 2.5 s và bước sóng khoảng 0.9 m dọc lane. | Chính | ✅ tham số đọc từ node đang chạy, 🔎 mô hình |
| B | **Trễ và bão hoà trong chuỗi vận tốc.** `velocity_smoother` giới hạn gia tốc góc 1.5 rad/s². Gazebo DiffDrive giới hạn thêm 2.0 rad/s². `scale_velocities: false`. Với lỗi ngang chỉ khoảng 3.5 cm, smoother đã bị rate-limit, gây thêm trễ pha. Vòng điều khiển ở A vì thế thành limit cycle. | Chính | 🔎 |
| C | **Đường tâm lane trong graph tự nó gấp khúc.** Endpoint nằm cách lane ≤ 5 cm bị biến thành node tại chính toạ độ endpoint, nên lane bị bẻ qua nó. Các chord junction cũng không thẳng hàng. Mỗi điểm gấp là một xung kích thích vòng A/B. | Kích thích | ✅ dữ liệu v018 |

**Yếu tố phụ:**
- AMCL nhảy map→odom vài lần mỗi giây (`sigma_hit` 0.2 quá lỏng so với nhiễu lidar trong sim).
- `wheel_separation` của Gazebo (0.4535) khác hình học bánh sim (0.296), nên robot quay mạnh hơn lệnh khoảng 1.5 lần.
- Collision monitor "approach" bóp các cú rẽ về phía kệ.
- Gate authority dùng đồng hồ wall-time, có thể chèn Twist 0.

**Lỗi đã sửa ngày 27/10** (xem §5). Các lỗi này làm hiện tượng nặng hơn nhiều:
- path thưa, quaternion bằng 0, có điểm trùng;
- gateway đứng hình 5 s mỗi lần cấp quyền;
- gate bị nối sai dây;
- backend chạy build cũ.

### 1.2 Lỗi an toàn và đúng đắn ở traffic/reservation (không gây hình sin, nhưng nguy hiểm khi có ≥2 robot)

- **Giải phóng tài nguyên mà không kiểm chứng robot đã rời đi**, vi phạm ADR 0009. Mỗi Active MOVE gọi `ReconcileRobot` với danh sách edge rỗng, xoá toàn bộ occupancy và cả quarantine. ✅
- **EXTEND là hold-and-wait nhưng không kiểm tra deadlock.** `ExtendAtomic` không gọi `WouldCreateWaitForCycle`, trong khi `AcquireAtomic` có gọi. ✅
- **Thiếu mutex** ở node giao cắt không có junction zone, ở connector ra/vào station, và ở lane hai chiều có capacity ≥ 2. 🔎
- **Robot không kiểm graphHash ở Active mode, và bỏ qua edge id lạ.** File graph trên robot cũ thì robot vẫn đi, nhưng đi tắt theo hình học sai. 🔎
- **`OccupancyGrid` ở backend bị lật dọc**, nên mọi kiểm tra clearance đang đánh giá trên ảnh gương của map. ✅

### 1.3 Mức độ tin cậy

- Nguyên nhân C và lỗi lật dọc OccupancyGrid đã được xác minh trực tiếp.
- Nguyên nhân A và B có số liệu tham số thực, còn biên độ và chu kỳ dao động là ước lượng từ mô hình. Mục 7 mô tả cách đo để chốt.

---

## 2. Luồng dữ liệu end-to-end

```
[Web Map Editor] ──click→pixelToWorld──► Edge (LineString m, ONE_WAY/BIDIRECTIONAL), Endpoint (x,y,yaw), Zone (Polygon)
      │  web/src/shared/map/mapCoordinateTransform.ts:49-74 ; làm tròn 1 mm (MapEditorPage.tsx:87-89)
      ▼
[Navigation DB] MapVersion(resolution, origin, image) + Edge/Endpoint/Zone ; DRAFT editable, PUBLISHED immutable
      ▼
[RouteGraphBuilder.Build]  (Modules/Navigation/RouteGraph/RouteGraphBuilder.cs)
   gộp đỉnh ≤5 cm → split tại giao điểm/zone boundary → bỏ KEEP_OUT → chord JUNCTION/NO_STOP/SINGLE_OCCUPANCY
   → gắn Endpoint (≤5 cm: thành node của lane; ≤0.5 m: connector vuông góc) → node id theo sort(X,Y), edge id tuần tự
      ▼
[TrafficGraphCompiler.Compile]  resources (lane, junction, bay, overlap), safe-stops/holding nodes, graphHash
      ├──► GET /maps/{id}/route-graph → GeoJSON 2-point MultiLineString (RouteGraphGeoJsonWriter.cs)
      │        └─► fetch_route_graph.sh → /home/ser/maps/route_graph_v018.geojson (robot: Nav2 route_server + polylines)
      ▼
[JobExecutionEngine.StartMoveAsync] (WorkflowExecution/Execution/JobExecutionEngine.cs:592-783)
   BindGraph → ReconcileRobot(edges=∅) → hold bay → RequestRouteAsync
      ▼
[RoutePlanner] nearest node (no cap/heading) → A* directed (cost = len·(1+1/speed) + congestion) → SegmentSafeStops
      ▼
[TrafficState.AcquireRoute → AcquireAtomic] CanAcquire / ReserveExits / Occupy → MotionAuthority(epoch, seq, segmentEdgeIds, pathHash)
      ▼
[TrafficAuthorityPublisher] NAVIGATE_TO_POSE{authority} / EXTEND_AUTHORITY (edges tích luỹ) / RENEW (1.5 s, TTL 30 s)
      ▼  MQTT
[robot TrafficClient] validate (epoch/seq, prefix, pathHash) → Nav2SegmentExecutor.follow_path(edges[covered:])
      ▼
[densify_path] chuỗi polyline → pose 5 cm có hướng → FollowPath(RPP)
      ▼
controller_server → velocity_smoother → collision_monitor → /cmd_vel_safe → cmd_vel_authority_gate → /cmd_vel → Gazebo DiffDrive
      ▲                                                                               ▲
   AMCL map→odom                                                   SafetySupervisor /traffic/authority_ok (20 Hz)
      │
SAFE_STOP_REACHED / STOPPED_AWAITING_AUTHORITY → backend ReportSafeStopReached / AdvanceRoute(ExtendAtomic) → EXTEND
NAVIGATE result SUCCEEDED → CompleteRoute (clear authority, giữ station hold)
```

**Hệ toạ độ:** editor, Fleet Map và generator Gazebo đều tuân theo `GAZEBO_COORDINATE_CONTRACT.md` (world ≡ map, chỉ lật trục Y).
- ✅ PGM của sim giống hệt PGM web, origin (−0.594, −2.719) @ 0.05 m.
- ✅ Không có offset giữa world và map. TF map→odom đo được khoảng (−0.06, −0.09) m, tức sai số AMCL, không phải lệch hệ toạ độ.
- Ngoại lệ duy nhất là `OccupancyGrid` ở backend (§4.1 G7).

---

## 3. Vì sao robot đi hình sin

### 3.1 Nguyên nhân A: tỉ lệ tốc độ trên lookahead

**Giá trị hiệu lực.** Các file tham số được merge theo thứ tự `nav2_params` → `outdoor` → `sim` → `route` (`warotrans_navigation/launch/navigation.launch.py:72-96`). Giá trị đọc trực tiếp từ node bằng `GetParameters` ngày 27/10 ✅:

| Tham số | Giá trị | Nguồn |
|---|---|---|
| `desired_linear_vel` | 0.35 | `warotrans_simulation/config/nav2_params_sim.yaml` |
| `lookahead_dist` / `min` / `max` | 0.20 / 0.15 / 0.30 | `nav2_params_route.yaml:12-14` (merge cuối) |
| `curvature_lookahead_dist` | 0.20 | `nav2_params_route.yaml:16` |
| `use_velocity_scaled_lookahead_dist` | false → `lookahead_time`, min, max **không có tác dụng** | `nav2_params.yaml:97` |
| `use_fixed_curvature_lookahead` | true (đổi ngày 27/10) | sim overlay |
| `max_angular_accel` (RPP) | 0.8 | base |

**Mô hình** 🔎. Pure pursuit tuyến tính hoá quanh đường thẳng cho động học lỗi ngang bậc 2 với ωn ≈ √2·v/L và ζ ≈ 0.707:
- **Sim:** v/L = 0.35/0.20 = 1.75 s⁻¹, suy ra ωn ≈ 2.47 rad/s, chu kỳ khoảng 2.5 s, bước sóng khoảng 0.9 m.
- **Trễ:** độ trễ ống vận tốc khoảng 0.15–0.3 s (controller 10 Hz, smoother 20 Hz, collision monitor, gate, bridge, Gazebo), làm mất 20–40° phase margin. Margin còn khoảng 15–30°, tức under-damped rõ rệt.
- **Robot thật:** v/L = 0.10/0.30 = 0.33 s⁻¹, nên cùng độ trễ hầu như không ảnh hưởng. Lý do tuning này ổn trên xe thật nhưng lượn trong sim là ở đây.
- **Quy tắc kinh nghiệm:** L ≥ v·(0.8–1.0 s). Ở 0.35 m/s cần L khoảng 0.28–0.35 m.

> 🔎 Cần xác nhận với source RPP Jazzy 1.3.13: khi `use_fixed_curvature_lookahead=true`, lệnh góc dùng điểm `curvature_lookahead_dist`. Nếu đúng thì chỉ tăng `lookahead_dist` là không đủ; phải tăng cả `curvature_lookahead_dist`.

### 3.2 Nguyên nhân B: trễ và bão hoà
- `velocity_smoother`: `max_accel` góc 1.5 rad/s², `max_velocity` góc 1.0, `scale_velocities: false` (`nav2_params_sim.yaml`, `nav2_params.yaml:187-191`). Hai trục bị cắt độc lập, nên độ cong thực tế khác độ cong RPP yêu cầu.
- Ở tần số 2.4 rad/s, smoother bắt đầu rate-limit khi biên độ góc vượt khoảng 0.62 rad/s, tương đương lỗi ngang khoảng 3.5 cm (ω ≈ v·2e/L² = 17.5·e). Mọi nhiễu vài cm, như kink, đầu segment hay bước nhảy AMCL, đều đẩy hệ vào vùng bão hoà và duy trì limit cycle.
- Gazebo DiffDrive `max_angular_acceleration: 2.0` (`warotrans_sim.urdf.xacro:162-163`) là bộ giới hạn thứ hai nối tiếp.
- Regulated scaling (`regulated_linear_scaling_min_radius: 0.9`) giảm tốc mỗi khi độ cong vượt 1.1 m⁻¹, tức lỗi ngang khoảng 2.2 cm. Vì vậy tốc độ dài cũng dao động theo nhịp lượn.

### 3.3 Nguyên nhân C: lane không thẳng trong graph ✅

**Cơ chế** (`Navigation/RouteGraph/RouteGraphBuilder.cs:500-507`): endpoint cách lane ≤ `VertexSnapTolerance` (0.05 m) được tạo node **tại toạ độ của endpoint**, rồi `SplitSegmentsThrough` bẻ lane đi qua node đó. Endpoint không được chiếu (project) lên lane.

**Ví dụ đo trên v018:**
- EDGE-090 nằm ở x = 0.442.
- Node 9 (EP-SORAGE_SELF_1) nằm ở (0.492, −0.849), lệch 5.0 cm, đúng ngay ngưỡng.
- Path 6 → 9 → 7 có hướng 82.4° rồi 97.8°, tức một chữ "V" sâu 5 cm giữa lane thẳng.
- Các kink 1–1.2 cm tương tự tại SELF_2 (x 1.600 → 1.612), SELF_5 (y −1.929 → −1.939), SELF_4 (y −1.935 → −1.944).

**Chord junction không thẳng hàng:**
- Hành lang trên: y đi qua −0.130 → −0.192 → −0.185 → −0.140 (edge 62, 98, 129).
- Hành lang dưới: y đi qua −1.461 → −1.472 → −1.487.

**Tổng thể v018:** 57 node, 108 edge directed (gồm 53 chord junction và 12 connector endpoint). Có 58 điểm gấp từ 0.3° đến 30°, và 13 edge ngắn hơn 8 cm. 🔎 Số liệu này do script phân tích của agent, chưa đếm lại thủ công.

**Robot không làm mượt:** `densify_path` (`warotrans_fleet/warotrans_fleet/nav2_segment_executor.py`) chỉ nối polyline và nội suy 5 cm, nên mọi kink đi thẳng vào FollowPath.

### 3.4 Yếu tố phụ

| Yếu tố | Chi tiết | File |
|---|---|---|
| AMCL jitter | Trong sim `/odom` là ground truth, nên mọi thay đổi map→odom là nhiễu ước lượng. `sigma_hit: 0.2` quá rộng so với nhiễu lidar 1 cm. Với `update_min_d: 0.10`, map→odom nhảy khoảng 3.5 lần/s ở 0.35 m/s. Bước nhảy 1–2 cm tạo ra độ cong 0.5–1.0 m⁻¹. 🔎 | `amcl.yaml:53-54,68-69` |
| Gain quay sai | DiffDrive `wheel_separation` = 0.4535 (giá trị skid hiệu dụng của xe thật), trong khi bánh sim đặt ở ±0.148 m (track 0.296). Robot quay mạnh hơn lệnh khoảng 1.2–1.5 lần, đẩy crossover lên và làm A/B tệ hơn. 🔎 | `warotrans_sim.urdf.xacro:30,37,160`, `simulation.launch.py:105` |
| Collision monitor | `time_before_collision` 1.2 s scale cả twist. Trong lane chỉ còn khoảng 9.5 cm mỗi bên, cú rẽ về phía kệ bị bóp còn cú rẽ ngược lại thì không, gây méo bất đối xứng. 🔎 | `nav2_params.yaml:389-399` |
| Gate wall-time | Supervisor publish `authority_ok` theo **sim time** (20 Hz). Gate đo tuổi tin nhắn theo **wall time** với ngưỡng 0.3 s. Khi RTF thấp hoặc executor bị nghẽn, gate chèn Twist 0 sau smoother, nên robot khựng rồi giật lại. 🔎 | `cmd_vel_authority_gate.py:18,117,120` |
| Ma sát bánh | `fdir1 1 0 0` nằm trong frame bánh, xoay theo bánh. Gây rung tần số cao (khoảng 3.4 Hz), không gây sóng 0.9 m. 🔎 | `warotrans_sim.urdf.xacro:90-94` |

### 3.5 Bằng chứng E2E ngày 27/10 ✅
- **Trước khi sửa:**
  - Ở cuối mỗi segment robot xoáy khoảng 90° (yaw từ −179° về +88°) rồi lao chéo vào chân SHELF-01.
  - Ở các góc rẽ robot quay gần trọn vòng với w = −1.0 rad/s, theo hướng xa nhất.
  - Gateway đứng hình 5 s mỗi lần nhận NAVIGATE hoặc EXTEND.
- **Sau khi sửa ở §5:**
  - Trên đoạn thẳng, yaw giữ trong khoảng 176–180°.
  - Ở safe-stop robot gần như không dừng.
  - Job đi được 11/17 bước, dừng do hình học map (§4.5).
- **Biên độ lượn còn lại sau khi sửa chưa được đo bài bản.** Cần chạy theo §7 để chốt mức đóng góp của A, B và C.

---

## 4. Phát hiện theo tầng

Mức độ: **HIGH** = sai hành vi hoặc mất an toàn, **MED** = sai trong điều kiện cụ thể, **LOW** = nhỏ hoặc tiềm ẩn.

### 4.1 Dựng map & route graph

| ID | Mức | Vị trí | Lỗi | Hệ quả lên robot | Đề xuất |
|---|---|---|---|---|---|
| G1 | HIGH | `warotrans_fleet/robot_gateway_node.py:133,260`; `traffic_client.py:262,373-376`; `robot_gateway_sim_active_overlay.yaml` | Ở Active mode, kiểm tra graphHash chỉ chạy khi có param `route_graph_hash`, mà overlay sim không set. Robot không đọc `properties.graphHash` trong file GeoJSON. | File graph trên robot cũ thì edge id từ backend bị hiểu theo hình học khác, và robot đi sai đường **không báo lỗi**. | Robot đọc `graphHash` trong file và reject NAVIGATE/EXTEND khi khác `authority.graphHash`. |
| G2 | HIGH | `nav2_segment_executor.py` (`_points` trả về `[]`) | Edge id không có trong file bị bỏ qua lặng lẽ. `densify_path` nối thẳng hai đầu còn lại. | Đi tắt một đường thẳng, có thể xuyên qua kệ. | Gặp edge lạ thì reject hoặc fault. Kiểm tra liên thông: điểm cuối edge k phải trùng điểm đầu edge k+1. |
| G3 | HIGH | `route_grant.py:80-100` | Hash dự phòng là SHA-256 của bytes file, còn backend băm canonical input (`TrafficGraphCompiler.cs:389-436`). Hai giá trị không bao giờ khớp. | Ở chế độ không phải Active, mọi NAVIGATE có route grant bị `ROUTE_GRAPH_MISMATCH`. | Bỏ fallback này, dùng `properties.graphHash`. |
| G4 | HIGH | `TrafficGraphCompiler.cs:389-436`; `RouteGraphModels.cs:40-46` | graphHash không chứa `RouteGraphOptions` (tolerance) hay phiên bản thuật toán builder. Builder đã đổi 3 lần ngày 25/10. | Cùng hash nhưng id hoặc edge khác, nên ngay cả khi bật kiểm hash cũng không phát hiện được. | Thêm `BuilderVersion` và options vào input của hash. |
| G5 | HIGH | `nav2_segment_executor.densify_path` (pose cuối lấy hướng segment cuối); `traffic_client.py:588`; `TrafficAuthorityPublisher.cs` (~96) | Yaw của endpoint không đi vào path. `finalGoal.yaw` chỉ dùng để đánh dấu hoàn tất, mặc định 0. Connector luôn đi vuông góc với lane (`RouteGraphBuilder.cs:509-519`). | Robot dừng sai hướng. EP-PARK-1/2 được tiếp cận bởi connector hướng +90° trong khi yaw PARK là −π/2, nên robot đỗ ngược 180°. Docking và sạc sẽ sai. | Thêm pose cuối mang `finalGoal.yaw` và bật rotate-to-goal ở segment cuối, hoặc cho graph biết hướng tiếp cận. |
| G6 | HIGH | `RouteGraphBuilder.cs:500-507` ✅ | Endpoint cách lane ≤ 5 cm thành node tại toạ độ endpoint, lane bị bẻ qua đó (§3.3). `FindOrAddNode` (586-587) kéo các điểm sau về node tạo trước, phụ thuộc thứ tự mã edge. | Kink 1–5 cm, robot lượn ngang ở các bay. | Chiếu endpoint lên lane (foot) và thêm spur edge foot↔endpoint, không bẻ lane. |
| G7 | HIGH | `Navigation/Traffic/OccupancyGrid.cs:114-119` (+53-75, 86) ✅; `TrafficDebugSvgWriter.cs:43-55` | `row = floor((y−originY)/res)` đếm từ đáy, nhưng mảng PGM lưu hàng trên cùng trước và không bị lật. Index `row*Width+col` vì vậy lấy pixel đối xứng gương. | `INSUFFICIENT_CLEARANCE` / `TURN_CLEARANCE` đánh giá trên ảnh gương: bỏ sót va tường thật, báo lỗi giả. Có thể đây là nguồn của `isValid=false (clearance/junction)` từng gặp. | `row = Height − 1 − floor(...)`, kèm unit test bằng PGM bất đối xứng. |
| G8 | MED | `RouteGraphBuilder.cs:309-390` | Chord junction là đường thẳng nối mọi đầu vào với mọi đầu ra, chỉ kiểm nằm trong polygon và ngoài KEEP_OUT, không kiểm tường (do G7). Zone NO_STOP và SINGLE_OCCUPANCY cũng sinh chord (dòng 129). | 53/108 edge là chord, có góc gắt 86–94°. Vẽ một zone "nhãn" lại sinh ra đường tắt mới có thể chạy được. | Chỉ JUNCTION mới sinh chord. Kiểm clearance chord (sau khi sửa G7). Ưu tiên nối thẳng hàng. |
| G9 | MED | `RouteGraphBuilder.cs:452-472,580-584`; `TrafficGraphCompiler.cs:494-523,806-814` | Chord chạy dọc biên zone không được gán `zone_codes` vì tolerance khác nhau. Có 7 edge như vậy trong v018 (80, 92, 96, 110, 117, 147, 157). | Các edge này thoát khỏi khoá `junction:<zone>`, nên hai robot có thể vào junction cùng lúc. | Thống nhất tolerance. Gán zone theo chord, không theo midpoint. |
| G10 | MED | `RouteGraphBuilder.cs:655` | Endpoint có thể gắn vào giữa một chord junction. | Bay bị tiếp cận theo góc chéo lạ. | Loại chord khỏi `NearestFoot`. |
| G11 | MED | `MapEditorCanvas.tsx:100-108,429-437`; `MapEditorPage.tsx:350-379` | Editor không snap vào đỉnh hoặc endpoint. Hai lane cắt nhau mà không có đỉnh chung thì không được nối (không split X). Editor không hiển thị graph đã compile hay kết quả validation. | Graph rời rạc hoặc phụ thuộc chord. Người vẽ không thấy lỗi. | Thêm snap. Hiện overlay graph compile và validation trong editor. |
| G12 | MED | `PublishMapVersion/Handler.cs:20-80`; `GetRouteGraph/Handler.cs:15-21`; `JobExecutionEngine.cs:930-938` | Publish không chạy validation. Export lọc bỏ lỗi clearance. Runtime gặp graph có lỗi chỉ log warning. | Map lỗi vẫn được publish và chạy. | Chặn publish khi có lỗi mức Error (sau khi sửa G7). |
| G13 | MED | `TrafficGraphCompileService.cs:107-122`; `CompiledTrafficGraphCache.cs:18-31` | Cache key không phân biệt bản compile có hay không có occupancy. | Sau restart, safe-stop thay đổi tuỳ endpoint nào được gọi trước. | Đưa `includeOccupancy` vào cache key. |
| G14 | MED | `TrafficAuthorityPublisher.cs:104`; `ProcessRobotTelemetryHandler.cs:61` | `MapVersionCode` trong authority lấy từ telemetry của chính robot. | Robot tự so với chính nó, nên kiểm map version vô tác dụng. | Lấy từ `job.MapVersionId` hoặc graph đã bind. |
| G15 | LOW | `MapEditorCanvas.tsx:443-444` | Mũi tên yaw dùng `-(yaw+originYaw)`, đúng phải là `-(yaw−originYaw)`. | Chưa ảnh hưởng vì originYaw = 0. | Sửa dấu. |
| G16 | LOW | `OccupancyGrid.cs:69-71` | Bỏ qua `occupiedThreshold`. Comment "unknown → obstacle" không đúng với pixel 205. | Clearance lệch nhẹ. | Áp dụng trinary đúng chuẩn map_server. |
| G17 | LOW | backend | Hỗ trợ `originYaw ≠ 0` không nhất quán (OccupancyGrid và Fleet Map bỏ qua). | Map có yaw sẽ lệch. | Reject `originYaw ≠ 0` khi import. |
| G18 | LOW | export | `Width`/`Capacity` của lane không xuống robot. Edge id đánh lại sau mỗi lần sửa hình học. | Làm hậu quả của G1 nghiêm trọng hơn. | Theo dõi, gắn với G1/G4. |

> **"108 edge vs 3 edge":** không phải lệch dữ liệu. 108 là tổng số edge directed của graph, khớp với GeoJSON khi build từ cùng trạng thái DB. 3 là số edge của **một segment** được cấp. Backend không densify; chỉ robot nội suy 5 cm.

### 4.2 Routing planner

| ID | Mức | Vị trí | Lỗi | Hệ quả | Đề xuất |
|---|---|---|---|---|---|
| R1 | HIGH | `Fleet/Traffic/RoutePlanner.cs:31,328-345`; `TrafficGraphQueries.cs:9-32`; `JobExecutionEngine.cs:689-695` | Start = node gần nhất theo khoảng cách Euclid. Không giới hạn khoảng cách, không chiếu lên edge, không xét heading hay one-way. Pose lấy từ DB, không kiểm độ mới; `PoseX` mặc định 0. | Robot đang ở giữa edge hoặc lệch graph sẽ đi về một node phía sau, ở lane song song hoặc bên kia tường, qua vùng **không được reserve** và có thể ngược chiều one-way. FollowPath luôn bắt đầu tại start node của edge đầu, không tại pose robot. | Chiếu pose lên edge gần nhất cùng chiều. Từ chối khi lệch quá X cm. Kiểm độ tươi của pose. |
| R2 | MED | `RoutePlanner.cs:255` | `turnPenalty` bị bỏ qua. | A* chọn đường nhiều góc gắt, khiến robot rẽ nhiều hơn và lượn nhiều hơn. | Đưa góc rẽ vào cost. |
| R3 | MED | `TrafficGraphCompiler.cs:200-223`; `JobExecutionEngine.cs:929-940` | Active mode compile với `includeOccupancy: false`, nên mọi node không critical và không phải station đều thành safe-stop, và không kiểm turn clearance. | Segment dài khoảng 1 edge, robot dừng ở **mọi node** để chờ EXTEND (dừng-chạy), mỗi lần xuất phát lại là một quá độ mới. Màn hình validation (có occupancy) hiển thị bộ safe-stop khác. | Compile có occupancy (sau khi sửa G7). Robot preempt nhận EXTEND khi đang chạy (§4.4 P8). |
| R4 | LOW | `RoutePlanner.cs:51-59, 61, 156, 131-144` | Đường hysteresis không kiểm điểm bắt đầu (chưa dùng). `FindAlternative` tính rồi bỏ. Cost chia đều cho các segment. Exit stop tính cho cả lane. | Tiềm ẩn. Gây `ReserveExits` block thừa. | Dọn dẹp. |
| R5 | LOW | `StationPolicyResolver.cs:24` vs `RoutePlanner.cs:360` | So khớp mã endpoint: một chỗ không phân biệt hoa thường, chỗ kia phân biệt. | Policy và goal có thể lệch nhau. | Thống nhất. |

### 4.3 Traffic segmentation & reservation

| ID | Mức | Vị trí | Lỗi | Hệ quả | Đề xuất |
|---|---|---|---|---|---|
| T1 | HIGH | `JobExecutionEngine.cs:637-643` ✅ → `TrafficState.cs:705-747`, `ReleaseResource` 1051 | Mỗi Active MOVE gọi `ReconcileRobot(edges=∅)`. Hàm này giải phóng **toàn bộ** occupancy (kể cả bay và service hold), xoá authority và pending segments, và gỡ quarantine chỉ dựa trên `LocalizationStatus` trong DB. Không kiểm clearance, không `PromoteWaiters`, không kiểm NAVIGATE còn đang chạy. Vi phạm ADR 0009. | Từ lúc reconcile đến lúc grant, chỗ robot đang đứng là "trống", nên robot khác có thể được cấp đi qua và va chạm. Quarantine OFFLINE, BLOCKED hay NAVIGATE-fail bị gỡ âm thầm. Nếu NAVIGATE trước vẫn chạy thì RENEW bị `AUTHORITY_MISMATCH` và robot dừng sau 3 s. | Chỉ reconcile khi khởi động hoặc sau khi robot báo authority_state. Giữ lại occupancy tại pose hiện tại. Không gỡ quarantine tự động. |
| T2 | HIGH | `TrafficProgressIngress.cs:86-102` | Khi nhận `authority_state` (robot boot hoặc reconnect), backend reconcile bằng pose cũ trong DB. `localizationOk` được hiểu thành "không FAULTED". | Reconnect giữa đường xoá authority, robot đứng. Backend reserve lại toàn bộ edge tích luỹ, kể cả edge đã đi qua. | Dùng pose trong message. Chỉ chiếm các resource tại pose đó. |
| T3 | HIGH | `TrafficState.cs:442-505` (`ExtendAtomic`) ✅ | Hold-and-wait: robot giữ segment hiện tại trong khi xin segment tiếp. Không gọi `WouldCreateWaitForCycle` (chỉ có ở `AcquireAtomic`, dòng 166), không enqueue, không set `BlockingOwner`. Comment ở dòng 146 nói "no hold-and-wait", sai với hàm này. | Hai robot đối đầu ở hai safe-stop kề nhau giữ thứ của nhau và retry mãi trên renew tick. Deadlock vĩnh viễn, không bị phát hiện. | Kiểm chu trình chờ, set BlockingOwner, có chính sách nhường (rút lui hoặc reroute). |
| T4 | HIGH | `Navigation/Traffic/SweptConflictIndex.cs:75`; resources của compiler | Node không phải là resource. Các edge chung đỉnh không sinh PhysicalOverlap. | Ở giao cắt hoặc nhập lane không có JUNCTION zone, hai robot có thể vào cùng một node cùng lúc. Validator chỉ báo Warning. | Thêm resource cho node giao cắt (bậc ≥ 3), hoặc bắt buộc có junction zone. |
| T5 | HIGH | `TrafficGraphCompiler.cs:167-196`; `RouteGraphBuilder.cs:425-426,518-519,732` | Connector endpoint không có mã edge hay zone nên không có lane resource. Resource bay chỉ phủ connector đầu tiên tìm thấy, theo một chiều. | Robot rời station theo chiều không được bảo vệ (nhất là sau T1) không giữ gì, nên robot khác có thể đi vào đối đầu. | Resource bay phủ cả hai chiều connector. |
| T6 | HIGH | `TrafficState.cs:995-1017` | `ReserveExits` chỉ kiểm tra, không giữ chỗ. Nó bỏ qua robot đang Moving hoặc Authorized tới cùng node, và robot idle không giữ resource. | Hai robot có thể được cấp segment kết thúc ở cùng một safe-stop. | Giữ chỗ safe-stop đích như một resource. |
| T7 | HIGH | `TrafficState.cs:181-183`, `PromoteWaiters` 871-908 | Waiter bị `EXIT_BLOCKED` chỉ xếp hàng trên resource của chính nó; chỉ được đánh thức khi một trong số đó được giải phóng. `ReconcileRobot` và `CancelRequest` không gọi `PromoteWaiters`. | MOVE treo ở `pendingTraffic` mãi mãi. | Xếp hàng cả trên resource của bên chặn. Gọi Promote sau mọi lần release. |
| T8 | HIGH | `TrafficReconciliationHostedService.cs:30-63`; `TrafficShadowObserver.cs:126-154` | Khi restart, chỉ seed các robot có NAVIGATE đang mở, và lấy edge từ `payload.route.edgeIds` (segment đầu, không gồm extension). | Robot đang giữa đường bị seed ở edge phía sau, nên vị trí thật không được reserve. Robot đang đỗ hoặc đang HUMAN hold không giữ gì. | Seed theo pose kèm authority mới nhất. Seed cả robot đang đỗ. |
| T9 | MED | `TrafficProgressIngress.cs:66-81`; `SegmentedTrafficCoordinator.cs:227-231` | `AdvanceRoute` vẫn chạy khi `ReportProgress` trả STALE. `STOPPED_AWAITING` trùng lặp, hoặc race với renew tick, gây double-extend. Không kiểm `AwaitingExtension` hay vị trí robot. | Robot được cấp segment nó chưa xin. | Chỉ advance khi progress được chấp nhận và robot đang ở `GoalSafeStopNodeId`. |
| T10 | MED | `TrafficState.cs:285-321` | `SAFE_STOP_REACHED` giải phóng mọi resource cách xa pose, kể cả resource thuộc extension đã cấp. | Kết hợp với T9: tài nguyên phía trước bị trả trong khi vẫn nằm trong authority của robot. | Không release resource thuộc phần authority chưa đi. |
| T11 | MED | `TrafficState.cs:1062-1085` | "Physically clear" = cách xa hơn 0.226 m. Không có biên sai số định vị, không xét footprint hay heading, không hysteresis. `ReportVerifiedExit` trả cả service hold. | Release sớm. | Thêm biên sai số định vị và kiểm bằng footprint. |
| T12 | MED | `TrafficState.cs:327-364`; `ProcessRobotCommandResultHandler.cs:110-118` | `CompleteRoute` không kiểm commandId, authorityId hay epoch. Release theo pose cũ đang lưu. | Result muộn hoặc trùng sẽ xoá route hiện tại. | Kiểm id. Dùng pose trong result. |
| T13 | MED | `TrafficState.cs:1250-1259`; publisher 76-81 | `Quarantine` không phát event và REVOKE không bao giờ được publish. | Robot bị quarantine vẫn chạy tới khi watchdog 3 s. Cancel không dừng robot qua kênh traffic. | Phát REVOKE_AUTHORITY. |
| T14 | MED | `Fleet/Traffic/TrafficEvents.cs:44` | Outbox `DropOldest`. Có ghi DB và publish cho mỗi RENEW mỗi 1.5 s. | Mất Grant: resource bị giữ mà không có NAVIGATE. Mất Extend: robot chờ mãi. | Không drop Grant/Extend; tách kênh RENEW. |
| T15 | MED | `TrafficGraphCompiler.cs:389-437` | Hash không chứa occupancy, station meta, service set. | Graph có bộ safe-stop khác nhau vẫn cùng hash. | Đưa vào hash. |
| T16 | MED | `TrafficState.cs:52-57`, `JobExecutionEngine.cs:633`, 976-979 | Coordinator chỉ có một graph, bind lại ở mỗi MOVE. `CanAcquire` bỏ qua resource id lạ. | Đổi map khi robot khác đang giữ chỗ gây sai lệch. | Mỗi map một state, hoặc từ chối rebind khi đang có holder. |
| T17 | MED | `TrafficGraphCompiler.cs:526-561,452` | Capacity lane dùng chung cho cả hai chiều. | Lane hai chiều capacity ≥ 2 cho phép hai robot đối đầu. | Tách resource theo chiều, hoặc dùng mutex hướng. |
| T18 | MED | `TrafficGraphCompiler.cs:256-301` | Node stopline bỏ qua loại trừ critical. | Footprint chồng lên đầu edge junction chưa được giữ. | Áp dụng loại trừ. |
| T19 | MED | `TrafficState.cs:1116-1151,351-352` | `BlockingOwner` cũ không được xoá. | Vừa bỏ sót deadlock, vừa báo `DEADLOCK_RISK` giả. | Xoá khi complete, reconcile, quarantine. |
| T20 | MED | `TrafficState.cs:902,930-935` | Re-enqueue reset thời gian chờ. | Starvation. | Giữ nguyên `EnqueuedAt`. |
| T21 | MED | publisher 116-131,198-209 | NAVIGATE đầu tiên lấy pose của safe-stop trung gian với yaw 0. EXTEND không có `goalSafeStopNodeId`. `SpeedLimits` không bao giờ được điền. | Giới hạn tốc độ theo zone không có hiệu lực trên robot. | Điền và truyền xuống robot. |
| T22 | LOW | nhiều chỗ | `.Distinct()` trên edge tích luỹ (`TrafficState.cs:483`); idempotency cache; ternary hai nhánh như nhau (`TrafficGraphCompiler.cs:484`); bay giữ dở không được trả khi hold lỗi (`JobExecutionEngine.cs:651-673`). | Tiềm ẩn. | Dọn dẹp. |

**Ghi chú về giao thức:** EXTEND gửi danh sách edge **tích luỹ** là đúng theo hợp đồng. Robot yêu cầu danh sách cũ là prefix và chỉ đi `edges[covered:]` (`traffic_client.py:379,410,584`). Robot không đi lại các edge đã qua.

**Khoảng trống test** (`backend/tests/WaroTrans.UnitTests/Fleet/Traffic`):
- **Test hiện có bị yếu:**
  - `Cyclic_wait_grant_rejected` assert `cycles.Length >= 0`, luôn đúng.
  - `Two_robots_at_one_junction` chấp nhận mọi lý do khác null.
- **Chưa có test cho:**
  - deadlock EXTEND (T3), crossing không có zone (T4), connector hai chiều (T5), hai robot cùng đích (T6), waiter EXIT_BLOCKED (T7);
  - start giữa edge hoặc ngược one-way (R1), restart (T8), STOPPED_AWAITING trùng (T9), result cũ (T12);
  - quarantine phải REVOKE (T13), outbox tràn (T14), capacity 2 (T17), reconcile ở đầu MOVE (T1), `authority_state` giữa đường (T2).

### 4.4 Robot: path & điều khiển

| ID | Mức | Vị trí | Lỗi | Hệ quả | Đề xuất |
|---|---|---|---|---|---|
| P1 | HIGH | `nav2_params_route.yaml:12-16`, sim overlay | v/L = 1.75 s⁻¹ (§3.1). Overlay `route` merge sau `sim` nên sim không chỉnh được lookahead. | Lượn hình sin. | Xem §6 P0-1. Đổi thứ tự merge (sim cuối cùng) hoặc thêm overlay sim+route. |
| P2 | HIGH | `nav2_params_sim.yaml` (smoother), `nav2_params.yaml:187-191`, `warotrans_sim.urdf.xacro:162-163` | Giới hạn gia tốc góc thấp, `scale_velocities: false`, `controller_frequency` 10 Hz. | Trễ pha, limit cycle. | Gia tốc góc ±3.0, `max_velocity` góc 1.2, `scale_velocities: true`, controller 20 Hz, Gazebo `max_angular_acceleration` 4.0. |
| P3 | HIGH | `nav2_segment_executor.densify_path` | Không làm mượt hay lọc kink (do G6 và G8 truyền xuống). | Kích thích dao động. | Gộp các đỉnh gần thẳng hàng (< 10°) và làm tròn góc (fillet) với bán kính nhỏ. |
| P4 | MED | `amcl.yaml:53-54,68-69` | `sigma_hit` 0.2, `update_min_d` 0.10, alpha mặc định. | Path nhảy so với robot. | Sim: `sigma_hit` 0.05–0.08, `laser_likelihood_max_dist` 1.0, `update_min_d/a` 0.05, alpha khoảng 0.01. |
| P5 | MED | `warotrans_sim.urdf.xacro:30,37,160`; `simulation.launch.py:105` | `wheel_separation` sim sai khoảng 1.5×. | Gain quay cao. | Đo bằng spin test, dùng giá trị riêng cho sim. |
| P6 | MED | `nav2_params.yaml:389-399` | Collision monitor `time_before_collision` 1.2 s. | Bóp cú rẽ bất đối xứng. | Sim 0.6–0.8 s. |
| P7 | MED | `cmd_vel_authority_gate.py`; `safety_supervisor` timer | Supervisor chạy sim time, gate đo wall time. | Chèn Twist 0 khi RTF thấp. | Gate dùng cùng clock, hoặc `max_authority_age_sec` khoảng 1.0 trong sim. |
| P8 | MED | `traffic_client.py:584`; `nav2_params.yaml:77` | Mỗi ticket kết thúc bằng goal check `xy_goal_tolerance` 0.15. EXTEND chỉ tới sau khi đã dừng. Segment ngắn (R3). | Dừng-chạy liên tục, mỗi lần khởi động là một quá độ. | Nhận EXTEND khi đang chạy thì preempt FollowPath với các edge còn lại. Tolerance route khoảng 0.05. |
| P9 | MED | `robot_gateway_node.py:487-504` | `SafetySupervisor` không được truyền `edges`, `progress_provider`, `next_edge_provider`. | Không phát hiện được vi phạm corridor hay robot đứng im. | Nối đủ. |
| P10 | MED | `nav2_segment_executor.py` | Không bao giờ gọi `on_edge_entered/exited`. | Không có EDGE_ENTERED/EXITED, `current_edge` luôn None, backend không biết tiến độ thật. | Theo dõi tiến độ theo pose robot so với polyline. |
| P11 | MED | `traffic_client.py:367,389` | `speedLimits` được parse nhưng không áp dụng. | Luôn chạy 0.35 m/s. | Áp dụng qua `speed_limit` topic của controller. |
| P12 | LOW | `warotrans_sim.urdf.xacro:90-94` | `fdir1` nằm trong frame bánh xoay. | Rung nhỏ. | `fdir1 0 0 1`, mu1 0.4, mu2 1.0. |
| P13 | LOW | `route_grant.py:170` | `distance_to_corridor` chỉ dùng hai điểm đầu cuối của edge. | Sai nếu edge cong. | Dùng cả polyline. |
| P14 | LOW | `nav2_params.yaml:97` | `lookahead_time`, min, max chết khi velocity-scaled tắt. | Gây hiểu nhầm khi tuning. | Bật hoặc xoá. |

Đã kiểm và **không có lỗi**:
- Hướng polyline khớp startid→endid cho mọi edge v018.
- Frame path là "map", stamp hợp lệ.
- Path không bị gửi lại giữa chừng.
- EXTEND không làm robot đi lại edge cũ.

### 4.5 Hình học map V018 (từ E2E 27/10) ✅

| ID | Vấn đề | Đo được | Đề xuất |
|---|---|---|---|
| V1 | EP-INBOUND (−0.045, −0.133) cách mặt tường Tây khoảng 0.21 m. | Footprint 0.16 m + padding 0.02 m trên lưới 5 cm: lidar nhiễu ở ranh giới ô khiến chính điểm đích bị đánh dấu lethal, RPP báo "collision ahead" và abort. | Dời EP-INBOUND (node 2) ra xa tường ≥ 0.10 m. Vá tạm hiện tại (chỉ sim): costmap 2.5 cm, padding 0. |
| V2 | Lane hoặc bay S01 (x ≈ 0.44–0.50) sát mặt SHELF-01 (lethal ở x ≈ 0.74–0.79 odom). | Bay cụt: vào đầu trước nên phải quay 180° để ra. Vòng quay của footprint (bán kính 0.206 m) chạm vùng lethal, xoay chậm dần rồi hết patience. Job dừng ở bước 12/17. | Dời lane hoặc endpoint của bay ra xa kệ 5–8 cm, **hoặc** thiết kế bay đi xuyên (vào một đầu, ra đầu kia), **hoặc** cho lùi ra (`allow_reversing`, không dùng chung được với `use_rotate_to_heading`). |
| V3 | Kink G6 tại SELF_1/2/4/5 | 1–5 cm | Sửa G6 hoặc dời endpoint lên đúng lane. |

---

## 5. Những gì đã sửa ngày 27/10

| Sửa | File | Ghi chú |
|---|---|---|
| `adjust_edges` không chặn ở Active mode (hết đứng hình 5 s mỗi lần cấp quyền) | `warotrans_fleet/nav2_route_client.py`, `robot_gateway_node.py` | Vĩnh viễn |
| `densify_path`: path đặc 5 cm, bỏ đỉnh trùng, quaternion theo hướng lane | `warotrans_fleet/nav2_segment_executor.py` + `test/test_segment_path.py` | Vĩnh viễn. Chưa làm mượt (P3) |
| Gate nối đúng: collision_monitor → `/cmd_vel_safe` → gate → `/cmd_vel` | `warotrans_navigation/launch/navigation.launch.py` | Vĩnh viễn. Trước đó gate không chặn được Nav2 |
| Overlay sim: `use_rotate_to_heading: true`, `use_fixed_curvature_lookahead` + `interpolate_curvature_after_goal`, local costmap 2.5 cm, padding 0 | `warotrans_simulation/config/nav2_params_sim.yaml` | Costmap và padding là **vá tạm cho V1** |
| Backend: epoch theo Unix seconds; fencing progress tách khỏi RENEW; giao thức hoàn tất route (Acquire/Advance/SafeStop/CompleteRoute); ACK là trạng thái cuối cho authority-control | `Modules/Fleet/Traffic/*`, `RobotCommand.cs`, `JobExecutionEngine.cs`, … | Có unit test |
| Robot: báo NAVIGATE result ở Active mode; CANCEL; khôi phục sau FAULT; telemetry trạng thái | `traffic_client.py`, `move_command_handler.py`, `robot_gateway_node.py` | Có unit test |

Chưa commit.

---

## 6. Lộ trình sửa đề xuất

### P0: hết lượn hình sin (ước lượng 0.5–1 ngày)
1. **Tuning RPP cho sim** (sửa thứ tự merge để overlay sim áp dụng sau `route`), chọn một trong hai:
   - **(a) Giữ 0.35 m/s:**
     - `use_velocity_scaled_lookahead_dist: true`, `lookahead_time: 0.9`;
     - `lookahead_dist: 0.30`, `min_lookahead_dist: 0.25`, `max_lookahead_dist: 0.40`;
     - `curvature_lookahead_dist: 0.30`.
   - **(b) Giữ lookahead 0.20** cho lane hẹp: hạ `desired_linear_vel` xuống 0.18–0.20.

   Mục tiêu là v/L ≤ 1.0–1.2 s⁻¹.
2. **Chuỗi vận tốc:**
   - smoother: gia tốc góc ±3.0, `max_velocity` góc 1.2, `scale_velocities: true`;
   - `controller_frequency: 20`;
   - Gazebo `max_angular_acceleration` 4.0.
3. **Graph thẳng:**
   - chiếu endpoint lên lane và thêm spur edge (G6);
   - nối chord junction thẳng hàng khi hai lane liên tục (G8);
   - robot gộp đỉnh gần thẳng hàng hoặc fillet (P3).

### P0: an toàn (1–2 ngày)
4. Bỏ reconcile toàn phần ở đầu mỗi MOVE (T1). Sửa reconcile khi nhận `authority_state` (T2).
5. Robot kiểm `graphHash` từ file và reject edge id lạ hoặc path không liên thông (G1, G2, G3). Đưa `BuilderVersion` và options vào hash (G4).
6. Lật hàng `OccupancyGrid` (G7), kèm test. Sau đó compile Active mode có occupancy (R3).

### P1: đúng đắn traffic (2–4 ngày)
7. Phát hiện deadlock trong `ExtendAtomic` (T3).
8. Mutex ở node giao cắt (T4).
9. Connector bay hai chiều (T5).
10. Giữ chỗ safe-stop đích (T6).
11. Đánh thức waiter (T7).
12. Seed khi restart (T8).
13. Chỉ advance khi progress được chấp nhận (T9, T10).
14. REVOKE khi quarantine (T13).
15. Outbox không drop Grant/Extend (T14).
16. Robot preempt khi nhận EXTEND để hết dừng-chạy (P8).
17. Start planner chiếu lên edge (R1).
18. Yaw cuối theo endpoint (G5).
19. Áp dụng `speedLimits` (T21, P11).
20. Nối SafetySupervisor (P9) và phát EDGE events (P10).

### P2: chất lượng sim và công cụ
21. Sim: AMCL (P4), wheel_separation (P5), collision monitor (P6), clock của gate (P7), ma sát bánh (P12).
22. Editor: snap, hiển thị graph và validation; chặn publish khi có lỗi (G11, G12).
23. Map V018: sửa V1 và V2, rồi gỡ vá tạm costmap.

---

## 7. Kế hoạch kiểm chứng

1. **Đo hình sin trước và sau P0:**
   - Ghi đồng thời `/cmd_vel_nav`, `/cmd_vel_smoothed`, `/cmd_vel` (angular.z), TF map→base_link và map→odom ở 20 Hz trên một đoạn thẳng dài (hành lang trên, x từ 2.4 xuống 0.2).
   - Tính sai số ngang so với polyline lane: RMS, biên độ, chu kỳ.
   - Nếu chu kỳ khoảng 2–3 s thì xác nhận A và B. Đặt mục tiêu RMS < 1 cm.
2. **Tách AMCL:** chạy một lần với map→odom tĩnh bằng pose spawn và AMCL `tf_broadcast: false`. Nếu biên độ giảm mạnh thì P4 là đóng góp chính.
3. **Spin test:** lệnh 0.5 rad/s trong 10 s, so yaw ground-truth để ra `wheel_separation` hiệu dụng.
4. **Chẩn đoán gate:** đo tần số `/traffic/authority_ok` và real-time factor (RTF) của Gazebo. Đếm số Twist 0 do gate phát.
5. **Unit test:**
   - backend: các test thiếu ở §4.3 (T1–T9, T12–T14, T17, R1) và test OccupancyGrid dùng PGM bất đối xứng (G7);
   - robot: `densify_path` có kink, reject edge lạ, kiểm graphHash.
6. **E2E:** `samples/simulation/run-job-sim.ps1` (inbound, 17 bước) phải qua 17/17. Kiểm trong snapshot traffic không còn authority treo. Sau đó chạy kịch bản 2 robot đi ngược chiều để thử T3, T4 và T6.

---

## 8. Phụ lục

### 8.1 Thứ tự merge tham số Nav2
`nav2_params.yaml` → `nav2_params_outdoor.yaml` → `warotrans_simulation/config/nav2_params_sim.yaml` → `nav2_params_route.yaml`. File cuối thắng (`navigation.launch.py:72-96`).

Hệ quả: overlay sim **không** ghi đè được lookahead của `route`.

Giá trị hiệu lực ngày 27/10, đọc bằng `rcl_interfaces/GetParameters` (CLI `ros2 param` bị treo do daemon):
- `use_rotate_to_heading` = true, `rotate_to_heading_angular_vel` = 0.45, `rotate_to_heading_min_angle` = 0.785
- `max_angular_accel` = 0.8
- `use_fixed_curvature_lookahead` = true, `interpolate_curvature_after_goal` = true
- `lookahead_dist` = 0.2, `min_lookahead_dist` = 0.15, `max_lookahead_dist` = 0.3
- `desired_linear_vel` = 0.35
- `use_cost_regulated_linear_velocity_scaling` = true
- `min_approach_linear_velocity` = 0.05, `regulated_linear_scaling_min_speed` = 0.05
- `general_goal_checker`: `xy` = 0.15, `yaw` = 3.14

### 8.2 Kink đã xác minh trong `route_graph_v018.geojson`
| Lane | Hướng lane | Node lệch | Lệch |
|---|---|---|---|
| EDGE-090 | x = 0.442 | 9 (EP-SORAGE_SELF_1) (0.492, −0.849) ✅ | 5.0 cm, góc 82.4° / 97.8° ✅ |
| EDGE-088 | x = 1.600 | 25 (SELF_2) x = 1.612 | 1.2 cm 🔎 |
| EDGE-099 | y = −1.929 | 14 (SELF_5) y = −1.939 | 1.0 cm 🔎 |
| EDGE-096 | y = −1.935 | 50 (SELF_4) y = −1.944 | 0.9 cm 🔎 |
| Hành lang trên | y khoảng −0.13…−0.19 | edge 62/98/129 | 6 cm 🔎 |

### 8.3 Giả định cần xác nhận
- RPP Jazzy 1.3.13 dùng điểm `curvature_lookahead_dist` cho lệnh góc khi `use_fixed_curvature_lookahead=true` (ảnh hưởng §6 P0-1).
- Mô hình ωn = √2·v/L và độ trễ 0.15–0.3 s là ước lượng. Cần đo theo §7.1.
- Hệ số gain quay 1.2–1.5× do `wheel_separation` cần spin test.
- Các số đếm 58 kink và 13 edge ngắn đến từ script phân tích của audit, chưa đếm lại thủ công.

### 8.4 Bằng chứng runtime ngày 27/10
- Trace pose 5 Hz: `/tmp/waro-sim-logs/pose.log` (WSL).
- Log MQTT: `/tmp/waro-sim-logs/mqtt.log`.
- Log launch: `/tmp/waro-sim-logs/run.log`.
- Job: JOB-20261027-000015 … 000020.

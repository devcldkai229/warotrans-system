# Semantic Traffic & Reservation — báo cáo gap cuối (2026-11-05)

Phạm vi: backend `warotrans-system` + robot `warotrans`, `Traffic:Mode=Semantic` (Nav2 lập plan, backend reserve zone/cell và cấp quyền, robot chỉ chạy trong vùng đã reserve), trên MAP-ONE-V002.

Trong đợt kiểm tra: **không có chuyển động vật lý**, **0 lệnh gửi tới RBT-001** (ghi lại MQTT, 0 downlink trên `warotrans/v1`), bridge chạy `motors_enabled=false`, DB dev `warotrans` chỉ đọc.

## Kết luận

| Mảng | Verdict | Căn cứ |
|---|---|---|
| **SOFTWARE** | **PASS** | Harness backend thật + Mosquitto + logic gateway, gồm F, L, 2 backend, frontend flow; chỉ còn 4 test RouteGraph cũ fail (xem dưới) |
| **PI** | **PASS có giới hạn** | Code đã deploy, build OK; readiness 30/31 (mục fail là E-stop); heartbeat/telemetry/localization lên backend và web thật. **Chưa chạy** NAVIGATE → Nav2 → gate trên Pi, vì không gửi lệnh tới RBT-001 |
| **HARDWARE** | **FAIL** | Không có E-stop phần cứng cắt nguồn motor (firmware chỉ có watchdog 300 ms) |
| **PHYSICAL** | **NOT RUN** | Chưa có lần chạy vật lý nào. Harness không phải bằng chứng thực địa |

Sửa nhận định của báo cáo trước:
- "12/12 kịch bản A–N" là nói quá: lúc đó harness chưa có F và L. Nay đã có.
- AWS: **không tìm thấy key đầy đủ** trong working tree hay lịch sử git của cả hai repo; `appsettings*` để trống. Chuỗi `AKIA` duy nhất trong lịch sử là câu trong `docs/traffic-hardening/P0_SECURITY_ENV.md`. Vẫn cần rotate vì key từng được dùng trên máy.

## Bằng chứng trên Pi thật (không chuyển động)

Lưu ở `warotrans/tools/traffic_e2e/artifacts/`: `pi_readiness.txt`, `mqtt_rec.log`, `fleet.png`.

- **Heartbeat/telemetry:** từ Pi tới backend qua broker `192.168.137.1`; 700 heartbeat, 3447 telemetry, **0 downlink**. SignalR `robotTelemetryUpdated` 25 message / 5 s. Web (`/monitor/fleet`) hiện RBT-001 trên map.
- **Localization:** đặt `/initialpose` tại Parking A → AMCL (1.26, −1.02), σxy 0,15, σyaw 0,21, cách Parking A 0,03 m; backend LOCALIZED đúng pose. Số liệu này phù hợp với robot đang đứng ở Parking A, nhưng **vị trí vật lý cần bạn xác nhận bằng mắt**.
- **Đồ thị velocity (`ros2 topic info -v`):** `/cmd_vel` không có publisher; `/cmd_vel_motor`: chỉ gate → bridge; `/traffic/authority_ok`: chỉ `robot_gateway` → gate; Nav2 → `cmd_vel_nav` → smoother → collision_monitor → `cmd_vel_safe` → gate. `authority_ok` luôn False.
- **Path thật:** planner LaneAwareNavfn trên Pi lập được 132/132 cặp endpoint (`real_nav2_paths.json`), chỉ gọi `ComputePathToPose`.

Lỗi chỉ lộ ra trên Pi thật, đã sửa:

| Lỗi | Hệ quả | Sửa |
|---|---|---|
| Đồng hồ Pi lệch **~24,7 giờ** (không RTC, không NTP trên hotspot) | Hạn grant theo giờ tường mất tác dụng | Đã đặt giờ. **Mỗi lần Pi khởi động lại phải đặt lại** (xem quy trình); readiness đo độ lệch với backend. Robot vẫn fail-closed nhờ timeout 3 s theo đồng hồ monotonic |
| Gateway báo **LOCALIZED tại (0,0)** khi `/initialpose` chưa tới AMCL (mẫu boot covariance = 0 lọt qua) | Backend có thể nhận vị trí sai | Cần `/amcl_pose` mới sau pose của operator; bỏ qua covariance 0 |
| Tool đặt pose publish trước khi AMCL match | AMCL không nhận pose | Chờ đúng subscriber `amcl` |
| Gateway khởi động trước khi có pose → quarantine `RECONCILE_LOCALIZATION` không tự hết | Job bị PAUSED | Có localization thì robot tự gửi lại `authority_state` |
| `localizationOk:false` bị backend bỏ qua nếu telemetry cũ còn mới | Tin nhầm vị trí | Lời báo của robot được ưu tiên |

## Các hạng mục mới

- **Parking A:** `Traffic:RobotHomeEndpoints` (`RBT-001 → EP-PARKING-A`, trong profile `RealRobot`). Job đầu tiên sau khi Host khởi động bị từ chối (`robot_not_at_home`, `robot_not_localized`) nếu robot không ở đó (≤ 0,30 m). Thêm robot sau này chỉ cần thêm dòng cấu hình. Job sau không bị chặn vì workflow INBOUND không có bước về parking.
- **Hai backend:** Host không giữ lease không xử lý uplink, không chạy monitor, không grant (`NOT_LEADER`). Khi giành lease: epoch mới lớn hơn mọi epoch cũ, reconcile từ DB, công bố epoch rồi mới mở grant. Đã sửa: `authority_state` trả lời epoch từng bị mất vì ingress mở sau khi công bố.
- **Pose khi bắt đầu MOVE:** telemetry cũ hơn `PoseMaxAgeSec` → Job PAUSED, không tin pose lưu trong DB.
- **Motor khoá:** `motors_enabled:=false` trên bridge; `tools/pi_run_semantic.sh` mặc định khoá motor.
- **Chuyển map:** `PUT /api/fleet/robots/{id}/map` (Admin), quy trình ở `warotrans/tools/switch_map.md`.

## Kết quả trên hình học thật của V002 (path Nav2, không phải synthetic)

`test_real_map_geometry.py` (7 test đạt):
- Không path nào có tâm đi qua điểm ảnh tường; không bước nào ngược ONE_WAY theo đúng quy tắc `moveAllowed` của planner; reservation phủ footprint suốt horizon.

Cần bạn biết trước khi chạy, **chưa sửa**:
- **56/132 path có footprint chạm điểm ảnh tường** ở vài pose, gồm Inbound → Shelf A-01 (18 pose), Parking A → Outbound (22 pose). Đây là phép kiểm tra thô trên PGM với heading của path, không phải costmap Nav2. Collision monitor vẫn chặn được, nhưng robot có thể dừng hoặc abort ở các đoạn này. Danh sách: `artifacts/footprint_touching_walls.json`.
- **Path bám ranh giới 2 lane đôi** (x≈0,98) và zigzag 5 cm. Hợp lệ theo planner, nhưng không đi giữa lane.
- **10/66 cặp endpoint** hai robot không đứng cùng lúc được (gồm Parking A–Parking B, Parking A–Shelf C-01), do bán kính reserve + ô 0,25 m. Không ảnh hưởng khi có 1 robot; **phải xử lý trước khi thêm robot thứ hai** (`artifacts/endpoint_conflicts.json`).

Tách bạch: kịch bản A–L dùng đường thẳng **synthetic** (phần lớn ngoài vùng vẽ map); C dùng zone thật; `test_frontend_flow` dùng **path Nav2 thật** nhưng robot vẫn là giả lập, không có động lực học.

## Lỗi đã sửa

Lỗi do kiểm tra code tìm ra:

| # | Lỗi | Sửa |
|---|---|---|
| T1 | Semantic: kết quả NAVIGATE không xoá authority, nên MOVE thứ 2 của job nhiều container bị `AUTHORITY_ALREADY_HELD` | `CompleteRoute` chạy ở cả Semantic, gắn với `commandId`; chỉ release khi có pose mới đã định vị |
| T2 | EXTEND trỏ tới NAVIGATE cũ đã cache; plan không thuộc lệnh backend nào (RViz) vẫn được cấp quyền | Grant gắn `commandId`; ingress kiểm tra NAVIGATE còn mở; `AllowStandaloneSemanticPlans=false` |
| T3 | Host khởi động lại ở Semantic thì bỏ qua toàn bộ seed, và Ready trước khi reconcile | Seed chờ policy (`AwaitingPolicy`); robot đang chạy dở thì `RECONCILE_IN_MOTION`, không rõ pose thì `RECONCILE_UNCERTAIN` |
| T4 | Robot dùng grant tới 30 s TTL, có thêm 3 s "grace" khi đổi plan, và không bị giới hạn trong vùng đã reserve | Bỏ grace. Chỉ chạy khi footprint ⊆ `grant ∩ cells(plan hiện tại)`; ≤ 3 s không có EXTEND/RENEW thì dừng; mất link, epoch mới hoặc REVOKE thì dừng ngay |
| T5 | Reservation chỉ lấy mẫu tại đỉnh pose, không bao trường hợp xoay tại chỗ | Đĩa bao footprint + dung sai lệch path, nội suy ≤ cell/4, lấy chính xác mọi cell giao đĩa (có test vector chung C#↔Python) |
| T6 | Robot dùng cell 0.5, backend dùng 0.25, nên không bao giờ báo verified exit | Grant mang `geometry`, robot tính theo đó |
| T7 | Đề xuất mới chen ngang waiter; waiter đề xuất lại thì mất thứ tự (starvation) | Không chen ngang (trừ waiter đang chờ chính mình); giữ `EnqueueSeq` |
| T8 | OFFLINE được gỡ chỉ bằng heartbeat | Cần pose định vị mới nằm trong occupancy đang giữ, nếu không thì `RECONNECT_UNVERIFIED` |
| T10 | Quarantine lúc bắt đầu MOVE làm Job FAILED vĩnh viễn | Job chuyển `PAUSED` (container giữ nguyên); sau `reconcile` thì `/resume` |
| T11 | Chờ traffic > 20 s làm Nav2 abort, MOVE bị FAILED | Abort khi gate đang giữ vì traffic thì gửi lại goal, vẫn giới hạn bởi `timeoutSeconds` |
| T12 | Teleop / `ros2 topic pub /cmd_vel` đi thẳng tới motor, bỏ qua gate | Gate xuất ra `cmd_vel_motor`; ESP32 bridge chỉ nhận topic đó và chỉ khi publisher duy nhất là gate; gate chỉ tin `authority_ok` từ `robot_gateway`; thêm `/warotrans/estop` (chỉ là lớp phòng thủ thêm) |
| T13/T14 | Không có thông báo epoch; hai Host có thể cùng cấp quyền | Postgres advisory-lock lease; retained `traffic/epoch` được publish trước mọi grant; `NOT_LEADER` khi không giữ lease |

Lỗi chỉ lộ ra khi chạy harness với backend thật:

| Lỗi | Hệ quả | Sửa |
|---|---|---|
| `/api/fleet/traffic/snapshot` trả 500 khi có grant Semantic | UI vận hành không xem được trạng thái traffic | `Maneuvers` / `ProposedPath` = `[]` |
| Host **không khởi động được** khi còn NAVIGATE Semantic đang mở (`"route": null`) | Restart backend giữa job thì backend chết | Parser kiểm tra `ValueKind` |
| Reconcile lúc khởi động bind RouteGraph cũ cả ở Semantic | Seed và clearance dùng hình học graph, nên không seed gì | Bỏ bind graph khi Semantic |
| Robot online sau khi Host khởi động không được seed chỗ đứng | Robot khác được cấp quyền đi xuyên qua nó | `MarkOnline` seed từ pose heartbeat đã xác minh (xung đột thì `SEED_CONFLICT`) |
| NAVIGATE bị abort do OFFLINE nhưng authority vẫn sống | Robot kết nối lại thì tiếp tục chạy lệnh đã bị huỷ | Revoke authority theo `commandId` trước khi quarantine OFFLINE |
| EXTEND/RENEW/REVOKE ở trạng thái `SENT` (robot không ACK) bị tính là in-flight | Navigate bị từ chối `robot_busy`; hàng trăm dòng `TIMEOUT` | Robot ACK (chấp nhận hoặc từ chối kèm lý do); kiểm tra busy bỏ qua các lệnh authority |
| `authority_state` lúc kết nối lại dùng pose DB đã cũ | Robot bị quarantine `RECONCILE_LOCALIZATION` vĩnh viễn | Message mang pose của chính robot |
| Monitor kết nối đánh OFFLINE mọi robot ngay sau khi Host restart | Mọi NAVIGATE bị abort mỗi lần restart | Grace bằng 3× heartbeat timeout sau khi khởi động |
| `put-in-service` trả 500 khi va chạm concurrency với telemetry | Không đưa robot vào vận hành được | Thử lại khi `DbUpdateConcurrencyException` |
| Mở connection mới tới `localhost` mất ~11 s (Windows/Docker), ingest MQTT bị chặn | OFFLINE giả, NAVIGATE bị abort | Profile `RealRobot` dùng `127.0.0.1`, giảm log EF; cảnh báo "Slow MQTT handler" > 500 ms |

5 unit test fail có sẵn từ trước:
- 2 test `SemanticReservationTests`: assertion được sửa thành chuỗi đầy đủ và chặt hơn (`QUARANTINED:OFFLINE`).
- 3 test MapOne: fixture V001 đã được export lại với mã đổi `EP-SHELFA01` → `EP-SHELF-A-01`, đã cập nhật mã. Sau đó test vẫn fail ở bước kết nối RouteGraph cũ (xem "Còn tồn tại").

## Kiểm thử

| Bộ test | Kết quả |
|---|---|
| Backend unit | 565 pass / 3 fail (MapOne RouteGraph cũ) |
| Backend integration (DB `warotrans_test`) | 242 pass / 1 fail (RouteGraph cũ) / 3 skip |
| Robot pytest, WSL + ROS Jazzy | fleet + navigation 282 pass; hardware 24 pass |
| colcon build | WSL 12 package OK; Pi 12 package OK (bỏ qua `warotrans_simulation`) |
| Web `tsc -b` | OK |
| **Harness + hình học thật** `test_traffic_e2e.py`, `test_real_map_geometry.py` | **23/23** (16 kịch bản A–N + 7 hình học) |
| **2 backend + frontend flow** `test_two_backends.py`, `test_frontend_flow.py` | **2/2** |

**4 test RouteGraph cũ, không che giấu:**
- `RouteGraphTests.An_endpoint_too_far…`: đã xác nhận **fail trên worktree `HEAD` sạch**.
- `MapOneRouteProofTests`, `MapOneTurnManeuverAuditTests`, `MapOneV7AcceptanceDiagnosticsTests`: trên `HEAD` fail vì mã cũ `EP-SHELFA01`; sau khi sửa mã, fail ở `CONN_FAIL` vì RouteGraph không nối được các chặng trên fixture V001 đã vẽ lại. Semantic không dùng RouteGraph, nhưng các test này **vẫn đỏ** và chế độ Active trên fixture đó chưa được xác minh.

Kịch bản harness (`warotrans/tools/traffic_e2e/test_traffic_e2e.py`) dùng `CommandRouter` / `MoveCommandHandler` / `SemanticTrafficClient` / `AuthorityGateLogic` thật. "Nav2" là đường thẳng; pose chỉ tiến khi gate mở.
- **A**: grant → RENEW → exit → release; bám đúng `targetCommandId`.
- **B**: 2 robot, path độc lập, được cấp quyền đồng thời.
- **C**: zone SINGLE_OCCUPANCY thật của V002: không lúc nào có 2 robot cùng giữ; robot chờ được thăng hạng.
- **D**: cắt ngang nhau ở vùng không có zone: phải tuần tự.
- **E**: đối đầu trong hành lang hẹp: không bao giờ cấp quyền đồng thời, robot đến gần nhất vẫn > 2R; một robot timeout.
- **G**: robot mất kết nối: giữ chỗ, dừng, robot khác không được cấp vào; kết nối lại thì không chạy tiếp lệnh đã bị abort.
- **H**: robot bị đẩy đi khi mất kết nối: chỉ reconcile từ pose do chính robot báo và đã xác minh.
- **I**: cancel dừng ngay; timeout ra `NAVIGATION_TIMEOUT` đúng hạn.
- **J**: EXTEND trùng, thiếu revision, epoch cũ, lệnh khác, hết hạn, sai hash, REVOKE của authority khác, plan cũ: không cái nào được chấp nhận.
- **K**: kill Host khi robot đang chạy: gate đóng ≤ 3,5 s và robot đứng yên; Host mới công bố epoch mới, robot bỏ grant cũ, reconcile rồi chạy xong dưới epoch mới.
- **M**: TR 2 container chạy qua REST thật: 4 lần xác nhận, Job COMPLETED, container DELIVERED, TR COMPLETED.
- **F**: replan vào vùng robot khác giữ: grant cũ bị REVOKE, gate đóng, robot đứng yên, không có grant cho plan đó; replan lại đường trống thì có authority mới và chạy xong.
- **L**: chu trình chờ bị từ chối `DEADLOCK_RISK`, không ai được cấp quyền, cả hai timeout; 3 robot: waiter sớm được phục vụ trước, robot đến sau không chen ngang.
- **N**: không robot nào có bước di chuyển nào khi quyết định traffic là "chặn".
- **2 backend**: một leader, standby từ chối; kill leader → standby lên epoch cao hơn; grant epoch cũ bị từ chối; robot chạy xong lệnh dưới leader mới; host cũ quay lại làm standby.
- **Frontend flow**: chuỗi API của `queueAndStart`, không truyền robot id: bị từ chối khi ở Shelf C-01; ở Parking A thì Inbound → Shelf A-01 → Shelf B-01 đúng thứ tự, 2 PICKUP_CONFIRM + 2 DROPOFF_CONFIRM đúng container, Job/TR COMPLETED.

Bằng chứng nằm ở `tools/traffic_e2e/artifacts/`:
- `pytest_full.txt`: kết quả pytest.
- `host-*.log`: log Host có timestamp.
- `robots.json`: kết quả, authority và lý do bị chặn của từng robot.
- `seed.json`: những gì đã seed vào DB test.

## Lệnh tái hiện

```powershell
# backend
cd warotrans-system/backend
dotnet test tests/WaroTrans.UnitTests
dotnet test tests/WaroTrans.IntegrationTests      # chỉ dùng warotrans_test (tự kiểm tra tên DB)
# robot (Windows hoặc WSL + ROS)
cd warotrans/ros2_ws/src
python -m pytest warotrans_fleet/test warotrans_navigation/test
# WSL: source /opt/ros/jazzy/setup.bash; colcon build --symlink-install --packages-up-to warotrans_bringup
# harness 2 robot (Docker postgres/mosquitto/mongodb đang chạy, cổng 5199 trống)
powershell -ExecutionPolicy Bypass -File warotrans/tools/traffic_e2e/run_traffic_e2e.ps1
```

Harness xoá các robot `E2E-*` của nó trong `warotrans_test`, rồi seed MAP-ONE-V002 + workflow INBOUND. Dữ liệu được đọc từ DB dev chỉ bằng `SELECT` (`seed_test_db.py`). Harness từ chối chạy nếu tên DB không chứa "test" hoặc prefix là `warotrans/v1`.

## Quy trình chạy trên robot thật

Chi tiết và chuyển map: `warotrans/tools/switch_map.md`.

1. **Điều kiện tiên quyết:** E-stop **phần cứng** đã được người thử, có người giám sát.
2. **Deploy:** `./tools/deploy.sh --pi waro@warotrans.local --no-delete` (không có `--no-delete` sẽ xoá 4 file map chỉ có trên Pi).
3. **Đồng hồ Pi** (sau mỗi lần Pi khởi động): `ssh -t waro@warotrans.local "sudo date -u -s @$(date +%s)"`.
4. **Backend + web:** profile `RealRobot`, `npm run dev` trong `web/`. `POST /api/fleet/robots/{id}/put-in-service` nếu robot chưa AVAILABLE.
5. **Khoá motor, kiểm tra:** trên Pi `BROKER=<IP laptop> ~/warotrans_tools/pi_run_semantic.sh start`, đặt robot ở Parking A, `python3 ~/warotrans_tools/set_initial_pose.py --x 1.244 --y -0.997 --yaw 1.571 --confirm-placed`, chạy `real_robot_readiness.py --backend-url http://<IP>:5090 --home-x 1.244 --home-y -0.997 --expect-motors-disabled`.
6. **Thử NAVIGATE khoá motor** (chưa làm): tạo TR, Run on robot. Kỳ vọng: Nav2 lập plan, backend grant, gate mở, bridge bỏ lệnh; Job FAILED/PAUSED do robot không tiến. Xem log rồi dừng.
7. **Chỉ khi 1–6 đạt và có E-stop:** `stop`, rồi `MOTORS=true BROKER=<IP> ... start`, đặt lại pose, readiness với `--estop-tested` (bỏ `--expect-motors-disabled`), rồi chạy có giám sát.

## Còn tồn tại / giới hạn

- **Phần cứng:** chưa có E-stop phần cứng; chưa chạy vật lý. `/warotrans/estop` chỉ là E-stop phần mềm.
- **Chưa kiểm chứng trên robot thật:** NAVIGATE → Nav2 → grant → gate mở → motor; bám path, dừng tại endpoint, dung sai đích, collision monitor với vật cản thật; xác nhận tại điểm dừng bằng người.
- **Nút xác nhận trên robot** đang tắt (`human_confirm_enabled: false`): xác nhận qua web/app.
- **Pin:** robot chưa có cảm biến nên UI hiện 0%. Workflow INBOUND không kiểm tra pin.
- **Deadlock vật lý:** khi 2 robot đối đầu, hệ thống phát hiện và không cấp quyền (an toàn). Gỡ thế kẹt cần operator hoặc một plan khác; lệnh sẽ timeout. Chưa có cơ chế tự lùi.
- **Một coordinator:** lease dựa trên một Postgres dùng chung. Không hỗ trợ nhiều instance active-active; `TrafficState` vẫn single-writer.
- **Chỗ đứng sau khi xong lệnh:** robot giữ các cell trong bán kính reserve tại đích cho tới lần plan kế tiếp hoặc reconcile, nên robot đỗ sẽ chặn route đi qua chỗ đó. Đây là chủ đích để an toàn; harness đỗ robot ra ngoài map.
- **Harness là bằng chứng về giao thức và trạng thái traffic, không phải về chuyển động vật lý.** Backend không kiểm tra tường cho plan Semantic.
- **Lease chỉ bật khi `RequireCoordinatorLease=true`.** Host chạy tắt lease trên cùng DB sẽ đánh OFFLINE robot của Host khác (đã gặp trong lúc test).
- **4 test RouteGraph cũ** fail, độc lập với thay đổi này (3 unit MapOne trên fixture V001 đã vẽ lại; 1 integration fail cả trên `HEAD` sạch).
- **Glue ROS của gateway** (`robot_gateway_node.py`) đã qua build, syntax và test wiring launch. Harness chạy cùng logic đó nhưng qua lớp glue riêng (`sim_robot.py`).
- **Bảo mật:** rotate AWS key vì từng được dùng trên máy (không có trong git). **Mật khẩu Pi rất yếu** và đã xuất hiện trong phiên làm việc: đổi mật khẩu và bật đăng nhập bằng key. `_agent_pi_ssh.py`, `_agent_pi_password_only_ssh.py` chứa mật khẩu dạng rõ (git đã ignore, chưa từng commit): nên xoá. `mqtt_record_RBT-001.json` và `prompt.md` đang được track: không chứa secret nhưng nên xem lại có cần giữ không.

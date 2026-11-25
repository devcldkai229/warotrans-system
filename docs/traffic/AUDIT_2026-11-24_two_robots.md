# Audit 2026-11-24: hai robot chạy thật không ổn định — lỗi, bằng chứng, cách sửa

Phạm vi: 3 repo — `warotrans-system` (backend), `warotrans` (RBT-001), `warotrans-rbt2` (RBT-002).
Kế hoạch triển khai đã duyệt: zone-chain, queue point bắt buộc, CHECK `ROUTE_CLEAR`, robot luôn thấy nhau, map MAP-ONE-V021/V022.

Trạng thái mỗi lỗi:
- ✅ **sửa** — đã sửa, có test;
- 🟡 **giảm** — đã giảm nhẹ, chưa sửa tận gốc;
- ⬜ **chưa** — chưa làm.

## Bằng chứng (DB dev và artifacts, 22–23/11)

**Lệnh và job**
- NAVIGATE của job: 26/50 bị huỷ giữa chừng, 24 hoàn thành.
- RETURN_TO_PARK: 34 lần khởi động, 5 lần tới nơi, 21 lần bị huỷ để nhường. Trong số đó, 17 lần do RobotCare tự huỷ (`yielded_to_job:000…`).
- 2 job FAILED với `RESULT_TIMEOUT`. Nhiều TR bị huỷ tay với ghi chú "lỗi chờ chéo".

**Snapshot traffic** (`warotrans/tools/traffic_e2e/artifacts/real_*`)
- Capacity 2812, DEADLOCK_RISK 843, HELD_BY 737, SEED_CONFLICT 488, retreat 297.

**Dừng an toàn**
- 22/11: thân xe còn cách 5.3 cm; robot bị cách ly nên traffic không thấy.
- 23/11 (`real_20261123_194453`): thân xe còn cách 5.4 cm. Backend chạy mode graph, snapshot traffic chỉ có RBT-002.

## A. Điều phối backend

| ID | Lỗi | Vị trí | Trạng thái |
|---|---|---|---|
| A1 | Robot chờ chỉ được xét lại khi có ô được nhả; Semantic không retry định kỳ; thân robot đứng trên ô không giữ thì không bao giờ "nhả" → chờ mãi | `SegmentedTrafficCoordinator.RenewAllActiveAuthoritiesAsync`, `TrafficState.PromoteWaiters` | ✅ `RetrySemanticWaiters` chạy mỗi nhịp gia hạn (test `ZoneChainTrafficTests`) |
| A2 | Robot giữ grant một phần, dừng ở biên (OUTSIDE_RESERVATION), không xin lại | `semantic_traffic_client.tick` | ✅ Xin lại sau 2 s bị giữ (test `test_held_at_the_end_of_its_grant_...`) |
| A3 | Ngõ cụt IN/OUT không có quyền vào độc quyền và không có queue; queue chỉ phục vụ đích cách tối đa 1.5 m | `JobExecutionEngine.WaitPoints` | ✅ Zone BAY độc quyền + `queueEndpointCodes` theo zone (`JobExecutionEngine.ZoneApproach`) |
| A4 | Deadlock chỉ phát hiện khi có proposal; lùi tránh không khả thi trong dải hẹp | `ResolveDeadlocksAsync` | 🟡 Zone-chain loại vòng chờ ngay từ thiết kế; resolver cũ vẫn giữ làm lưới an toàn |
| A5 | Ưu tiên tính lại liên tục, nên đổi qua đổi lại | `JobExecutionEngine`, `RobotCareService` | 🟡 Zone: FIFO theo thời điểm bắt đầu chờ, chốt một lần; ưu tiên job vẫn chưa truyền vào traffic |
| A6 | Chờ ngay trên lane (prefix dừng giữa đường) | `TrafficState.GrantablePrefix` | ✅ Zone-chain không cấp prefix; robot chờ ở bay, slot hoặc queue |
| A7 | Tự về parking sau 3 s rồi bị RobotCare huỷ, xoay vòng | `RobotCareService` | 🟡 `IdleSeconds` 8 (RealRobotZones); robot rảnh chắn bay bị đánh dấu `goalBlockedByRobotId` để dời đi |
| A8 | Plan neo vào pose heartbeat cũ | `TrafficState.AnchoredAtSeenPose` | ✅ Tắt ở zone-chain |
| A9 | DEADLOCK_RISK báo oan do cạnh chờ cũ của chính robot | `WouldCreateWaitForCycle` | ✅ |
| A10 | `PromoteWaiters` chạy lồng | `TrafficState` | ✅ Chặn gọi lồng, xử lý các lần giải phóng còn treo sau khi xong lượt |
| A11 | Robot mất định vị bị bỏ qua khi xét thân xe | `TrafficState.BodyInTheWay` | ✅ Dùng pose cuối, xét mọi hướng, cộng biên định vị |
| A12 | Seed từ pose DB cũ; cách ly SEED_CONFLICT bật tắt | `TrafficReconciliationHostedService` | ⬜ |
| A13 | Intent YIELDING không bao giờ đóng | `RobotPositioningService.SettleAsync` | ⬜ |

## B. Giao thức robot ↔ backend

| ID | Lỗi | Trạng thái |
|---|---|---|
| B1 | ACK từ chối EXTEND bị backend bỏ qua, EXTEND bị gửi lại vô hạn | ⬜ |
| B2 | Rào progress-seq làm mất các ô đã báo trống | ⬜ (zone-chain: zone được nhả theo pose, không phụ thuộc danh sách ô robot báo) |
| B3 | Tính thời gian chờ không nhất quán (DEADLOCK_RISK tính vào timeout) | ✅ Cả backend và robot đều không tính thời gian chờ điều phối |
| B4 | Robot bị giữ mà goal Nav2 vẫn mở, nên abort 20 s rồi gửi lại goal | 🟡 BT chỉ replan khi đường bị chặn, và grant cả đường nên ít bị giữ giữa chừng; luồng lập plan → giữ chỗ → chạy chưa làm |
| B5 | `yawTolerance` không gửi xuống robot | ⬜ |
| B6 | Mode backend và robot lệch nhau, robot vô hình | ✅ Gỡ ROUTE_GRAPH khỏi `rbt2_start.sh`; ⬜ chưa có bắt tay mode tự động |

## C. Hai robot lệch nhau

| ID | Lỗi | Trạng thái |
|---|---|---|
| C1 | AMCL của RBT-002 dùng tham số cũ | ✅ Theo giá trị của RBT-001 (0.05 / 0.08 / 0.1 / 1.0) |
| C2 | Core của RBT-002 thiếu commit, có chỗ sửa trực tiếp | ✅ Đồng bộ toàn bộ core bằng `sync_from_rbt1.py`, thêm `warotrans_fleet_layer` |
| C3 | Khung kiểm tra `recovery_guard` của RBT-001 lệch tâm | ✅ Thêm `center_x`, overlay `nav2_params_rbt001.yaml` |
| C4 | Bundle mặc định V014 | ✅ Mặc định `map_one_v022` ở cả 2 script |

## D. Nav2 và khả năng nhận biết

| ID | Lỗi | Trạng thái |
|---|---|---|
| D1 | Lidar quét ở ~18 cm, thân RBT-002 cao 10 cm, nên robot gần như không thấy nhau | ✅ Đã code: `fleet/poses` → `fleet_obstacles` → `warotrans_fleet_layer` và collision monitor (overlay `nav2_params_fleet.yaml`). ⬜ Còn phải đo `/scan` thật ở lab |
| D2 | Robot đứng yên thì không replan; `inf_is_valid` false | ✅ BT dùng `IsPathValid` + `RateController` 1 Hz; `inf_is_valid` true |
| D3 | ~~Map tĩnh không có kệ~~ — **không phải lỗi**: kệ chỉ là hình dán trên tường (người dùng xác nhận 2026-11-24). Map tĩnh chỉ có tường là đúng. Vì vậy phần costmap mất ô trống (18–21% so với 38%) là vết ma (robot kia, vị trí cũ, nhiễu), không phải chân kệ → xử lý bằng `inf_is_valid` + fleet layer (D1, D2) | ✅ không cần làm |

## E/F. Map, workflow, kiểm thử

**E1 — Map**
- V021 là map PUBLISHED của người dùng.
- V022 (DRAFT) = V021 + 15 zone: 5 BAY, 3 TRANSIT, 1 YARD, 6 SLOT.
- Snapshot: `samples/maps/MAP-ONE-V022`. Bundle: `map_one_v022`, fingerprint `4692882b…`.

**E2 — Workflow:** đã có CHECK `ROUTE_CLEAR`. ⬜ Chưa tạo workflow v3 (cần Host mới chạy để validator nhận mã này).

**F1 — Kiểm thử:** harness `tools/traffic_e2e/test_flows_v022.py`. Robot giả lập vẫn là điểm di chuyển mọi hướng, chưa giống Nav2.

## Vấn đề cần người dùng quyết

1. **EP-QUEUE-B (2.27, −0.45) chắn đường thoát của INBOUND.**
   - Đường từ INBOUND rẽ sang lane RTL ở y ≈ −0.14 quét trúng thân robot đứng ở queue này.
   - Engine đã tự xử lý: robot chờ sẽ chuyển sang EP-QUEUE-A (sim pass). Cái giá là một chặng đi vòng.
   - Đề xuất: dời QUEUE-B xuống khoảng y ≈ −0.80 (sát dưới lane LTR), sau khi bạn kiểm tra thực địa.
2. **Map đã PUBLISHED không sửa được**, nên phần chia zone nằm trong V022. Cần bạn đồng ý publish V022 và chuyển 2 robot sang V022 (hiện DB vẫn ghi V019).

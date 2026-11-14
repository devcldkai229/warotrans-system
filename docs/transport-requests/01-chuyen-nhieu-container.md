# Transport request theo chuyến: tối đa 3 container mỗi robot

> Ngày 2026-11-13. Phần đầu đã có ở commit `a0e4272` (develop). Phần hoàn thiện nằm trên nhánh `feature/trip-batching`
> (system) và `feature/endpoint-tolerance` (robot).

## 1. Mô hình: một chuyến là một Job

- Mỗi **Job là một chuyến của một robot**, chở tối đa **N container**.
  - N = min(`JobPlanning:MaxContainersPerJob` = 3, sức chứa lớn nhất của robot trên map, `RobotLoad.MaxContainers` = 3).
- Khi transport request vào hàng đợi (`POST /transport-requests/{id}/queue`), backend lập **tất cả** các chuyến một lần (`CollectThenDeliverJobBatchPlanner`).
  - Container được sắp theo: điểm lấy xuất hiện trước, rồi đến điểm giao xuất hiện trước, rồi `SequenceNo`.
  - Sau đó cắt thành từng chuyến theo N và theo tải trọng (`max_payload_kg`).
  - INBOUND: 1 điểm lấy, nhiều kệ giao; container cùng kệ đi chung chuyến.
  - OUTBOUND: nhiều kệ lấy, 1 điểm giao.
  - INTERNAL: lấy đủ ở mọi kệ rồi mới đi giao.
- Trong một chuyến, mọi điểm lấy (PICKUP) đi trước, các điểm giao (DROPOFF) đi sau, nhóm theo endpoint.
- `JobBatchPlanValidator` từ chối chuyến nào nhiều hơn 3 container (`job_batch_over_robot_load`).

## 2. Hàng đợi và phân robot

- "Run on robot" bắt đầu chuyến 1.
- `JobQueueProcessor.FindWaitingTripsOfStartedRequestsAsync` đưa mọi chuyến còn CREATED của transport request đó vào hàng đợi.
- Robot rảnh nhận chuyến theo thứ tự hàng đợi (score, rồi `QueuedAt`, rồi `JobNo`):
  - **2 robot rảnh:** 2 chuyến chạy song song (unit test `Two_free_robots_take_two_waiting_trips_at_once`).
  - **1 robot:** robot làm xong chuyến 1 rồi tự nhận chuyến 2, không về bãi đỗ. Đã kiểm trên Gazebo: chuyến 2 bắt đầu khoảng 2 giây sau khi chuyến 1 COMPLETED.
- Chuyến đang chờ ghi rõ lý do (`blockingReason`), ví dụ `robot_busy`.
- Mỗi robot chỉ giữ một job đang mở (unique index `ux_job_robot_assignments_active_robot`), kể cả job RECOVERY_REQUIRED.

## 3. Backend chặn 3 container (robot không tự đếm)

| Chỗ chặn | Luật |
|---|---|
| Lập chuyến | N ≤ 3 |
| `PUT /robots/{id}/capacity` | `maxContainers` > 3 → `robot_capacity_above_limit` |
| Dispatch | `RobotLoad.EffectiveMaxContainers`: robot chưa khai sức chứa vẫn chỉ chở tối đa 3 |
| Xác nhận lấy hàng | Số ONBOARD + 1 > sức chứa → `robot_capacity_full`; bước vẫn WAITING |

## 4. Điều kiện container khi tạo transport request

| Loại | Nguồn → đích | Container | Phiếu | Mã lỗi |
|---|---|---|---|---|
| INBOUND | không phải kệ → kệ | CREATED/PACKED, chưa có vị trí | INBOUND CONFIRMED | `inbound_source_is_storage`, `inbound_destination_not_storage`, `container_already_stored`, `inbound_voucher_required` |
| OUTBOUND_RETRIEVAL | kệ → không phải kệ | STORED đúng kệ (và tầng) nguồn | OUTBOUND CONFIRMED | `outbound_source_not_storage`, `outbound_destination_is_storage`, `container_not_at_source`, `outbound_voucher_required` |
| INTERNAL_RELOCATION | kệ → kệ khác | STORED đúng kệ nguồn | không cần | `relocation_requires_storage_locations`, `relocation_same_location`, `container_not_at_source` |

Các luật chung:
- Chỉ nhận container CREATED/PACKED/STORED (container ISSUED, HOLD, IN_TRANSIT bị từ chối).
- Container đang nằm trong một transport request khác còn mở thì bị từ chối.
- Kệ phải đang hoạt động và gắn đúng endpoint.

## 5. Trạng thái container khi xác nhận

| Sự kiện | Kết quả |
|---|---|
| Xác nhận lấy hàng (mọi loại) | IN_TRANSIT; nếu đang STORED thì trừ tồn kho của kệ nguồn |
| Xác nhận trả hàng, INBOUND / INTERNAL | STORED tại kệ đích (tầng mặc định 1), cộng tồn kho |
| Xác nhận trả hàng, OUTBOUND (có phiếu xuất CONFIRMED) | ISSUED |

`JobContainerStatusChangedHandler` gọi `StockPostingProcessor.PostNowAsync` ngay sau xác nhận, nên giao diện đổi trạng thái ngay. Đã test trong `ContainerMovementRecorderTests` và `StockVoucherEndpointTests`.

## 6. Dung sai đến đích của từng endpoint xuống robot

- Lệnh NAVIGATE mang `payload.positionTolerance` (m) lấy từ `position_tolerance` của endpoint đích.
- Gateway dùng giá trị này thay cho `arrival_refine_xy_m` (không gửi lại goal khi đã nằm trong ngưỡng) và thay cho `docking_arrive_xy_m` (bỏ qua bước lùi vào ô và bước chỉnh tư thế khi đã đủ gần). Nav2 goal checker giữ nguyên ngưỡng riêng.
- DB dev: EP-INBOUND và EP-OUTBOUND = 0.12 trên mọi map version; MAP-ONE-V006 đặt 0.12 cho cả 11 endpoint.
- Log gateway: `[Nav2GoalSent] ... positionTolerance=0.12`.
- **Deploy lên Pi (bạn tự làm):**
  1. Pull nhánh `feature/endpoint-tolerance` (hoặc develop sau khi merge) vào `~/warotrans_ws/src`.
  2. `colcon build --symlink-install --packages-select warotrans_fleet`.
  3. Khởi động lại service gateway.
  4. Kiểm log `[Nav2GoalSent] ... positionTolerance=`.

## 7. Giao diện web

- Trang transport request có mục "Chuyến (n)": robot hoặc "Chờ robot rảnh", điểm dừng, danh sách container.
- Danh sách job có cột "chuyến k/n" và số container "n/3".
- Trang chi tiết job hiện "Chuyến k/n" (API job detail trả `tripNo` và `tripCount`).
- Tiêu đề nhóm bước ghi kèm điểm dừng: "Lấy 3 container tại …", "Giao 1 container tại …".
- Màn chọn container ưu tiên container trong phiếu nhập/xuất đã xác nhận, nhóm theo phiếu, có nút "Chọn cả phiếu".

## 8. Kết quả kiểm chứng (2026-11-13)

**Tự động:**

| Bộ test | Kết quả |
|---|---|
| Backend unit | 862 qua |
| Backend architecture | 11 qua |
| Backend integration (DB `*_test`) | 446 qua |
| Web (typecheck, lint, build) | qua |
| Web test | 195/195 |
| Robot gateway pytest | 402 qua |

**Gazebo:** INBOUND 5 container tới 3 kệ, 1 robot (`REQ-20261113-000012`).
- Lập được 2 chuyến: 3 + 2 (`JOB-20261113-000012`, `JOB-20261113-000013`).
- Chuyến 2 vào hàng đợi ngay, chờ với lý do `robot_busy`.
- Chuyến 1: lấy 3 container tại INBOUND, giao 2 lên A-01 và 1 lên B-01. COMPLETED.
- Robot tự nhận chuyến 2 sau khoảng 2 giây, lấy 2 container tại INBOUND, giao 1 lên B-01.
- Container cuối cùng **chưa giao được lên B-02** vì robot kẹt điều hướng ở khu kệ B (mục 9). Dữ liệu vẫn đúng: 4 container STORED đúng kệ và tầng, 1 container IN_TRANSIT; transport request PARTIALLY_COMPLETED (vẫn mở).

## 9. Còn tồn đọng

1. **Kệ không có giới hạn sức chứa**: `StorageLocation` và `InventoryStock` không có số chỗ hay số tầng tối đa, nên INBOUND có thể cất không giới hạn vào một kệ hoặc một tầng.
2. **Ước tính số chuyến trên composer** dùng hằng số 3, chưa tính sức chứa thật của robot hay tải trọng.
3. **Điều hướng khu kệ B trên Gazebo:**
   - Đi từ B-01 sang B-02 thì kẹt ở miệng ô B-02, và kẹt ở chặng tới điểm xoay (1.319, −0.085).
   - Bước lùi vào B-01 mất 6 phút mà watchdog không cắt.
   - Lần đầu, bước lùi vào B-01 bị cắt sai: watchdog cộng dồn thời gian từ chặng travel trước. Đã sửa trên nhánh `feature/endpoint-tolerance`: sang bước docking mới thì tính là có tiến triển.
4. **Hai robot cùng tới INBOUND:** chưa thử thật (chưa có robot thứ 2). Mới kiểm bằng unit test hàng đợi.
5. **Recovery** vẫn chuyển nguyên một chuyến sang robot khác, không tách từng container.

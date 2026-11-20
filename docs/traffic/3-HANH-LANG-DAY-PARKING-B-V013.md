# Lỗi kẹt 2 robot ở hành lang dưới Parking B (MAP-ONE-V013)

Ngày: 2026-11-20 · Phạm vi: Traffic semantic (backend), Nav2 planner (robot), RobotCare nhường đường (backend), dữ liệu map
Liên quan: [2-ROBOT-DEADLOCK-FIXES-V013.md](2-ROBOT-DEADLOCK-FIXES-V013.md)

## 1. Tóm tắt

Chạy job inbound J201126001 (3 container) với RBT-001, trong khi RBT-002 đang đỗ ở Parking B. RBT-001 rời Parking A,
đi được khoảng 0.3 m rồi đứng chờ mãi. Web báo `RBT-001 đang chờ RBT-002 · Capacity @ cell:-1:-6`.

Có **4 nguyên nhân chồng lên nhau**:

| # | Nguyên nhân | Tầng | Trạng thái |
|---|---|---|---|
| 1 | `ZONE-SINGLE-CENTER` bị robot đỗ ở Parking B khóa "ảo" | Dữ liệu map | **Đã sửa** (thu nhỏ zone) |
| 2 | Đường Nav2 lập ra đi sát dưới Parking B, nhưng traffic coi là quá sát | Nav2 ↔ Traffic | **Chưa sửa** |
| 3 | Hai xe đứng gần nhau thì không xe nào xuất phát được (khóa cứng) | Traffic | **Chưa sửa** |
| 4 | RobotCare không bắt RBT-002 nhường đường, hoặc chọn sai đích nhường | RobotCare | **Chưa sửa** |

Cách vận hành tạm thời: **robot đỗ ở Parking B phải rời bãi trước, rồi robot ở Parking A mới được đi qua** (mục 5).

## 2. Hình học khu vực

```
            tường
   ┌──────────┐    ┌──────────┐
   │ Parking A│    │ Parking B│      A = (-0.61, -0.71)  hướng nam
   │    (A)   │    │    (B)   │      B = ( 0.24, -0.71)  hướng nam
   └────┬─────┘    └────┬─────┘      A–B cách nhau 0.85 m
════════╧═══════════════╧══════════════>  hành lang đáy (y ≈ -0.9 … -1.2), lối duy nhất sang phía đông
```

Thông số liên quan:

| Thông số | Giá trị |
|---|---|
| Thân xe thật (Gazebo / gateway) | 0.30 × 0.264 m |
| Thân xe backend dùng (`Traffic:Footprint`, đã cộng padding 0.02) | 0.36 × 0.31 m, bán kính bao 0.2375 m |
| Dung sai bám đường `SemanticPathToleranceMeters` | 0.15 m |
| Ô lưới semantic | 0.10 m |
| Vùng quét mỗi điểm trên plan (`ReserveRadius`) | 0.2375 + 0.15 + 0.05 ≈ **0.44 m** |
| Vùng chiếm của xe đứng yên (`ResourcesUnder`) | 0.2375 + 0.05 ≈ **0.29 m** |
| Nav2 `inflation_radius` | 0.35 m (chi phí mềm, không cấm) |

## 3. Chi tiết từng nguyên nhân

### 3.1 Zone trung tâm bị khóa ảo (đã sửa)

Mép `ZONE-SINGLE-CENTER` chỉ cách tâm Parking B 0.248 m. Một xe đứng yên ở B cũng bị coi là đang "ở trong" zone, nên
mọi xe khác cần đi qua zone đều phải chờ.

**Đã sửa:** thu cạnh trái/dưới của zone. Tâm Parking B giờ cách zone khoảng 0.333 m, lớn hơn vùng chiếm 0.29 m. Đã sửa đồng bộ:
- `samples/maps/MAP-ONE-V013/snapshot.json`
- DB `navigation.zones`
- `single_occupancy.json` + `semantic_manifest.json` ở repo robot (fingerprint mới `569c86f6…`)

Sau khi sửa, RBT-002 đỗ ở B không còn giữ zone nào.

### 3.2 Nav2 và traffic dùng hai tiêu chí khác nhau

Plan của RBT-001 từ Parking A sang Inbound đi dọc hành lang đáy, **tâm cách RBT-002 chỉ 0.39 m**.

| Đo theo | Khe hở nhỏ nhất giữa 2 thân xe |
|---|---|
| Thân xe thật | **7.6 cm** |
| Thân xe backend | 1.7 cm |
| Mô hình traffic (vùng quét 0.44 m + chiếm 0.29 m ≈ cần tâm cách ≥ 0.73 m) | **chồng nhau**, nên bị từ chối |

Vì sao Nav2 vẫn lập đường sát như vậy:
- Global costmap có `obstacle_layer` (lidar), nên Nav2 **có thấy** RBT-002.
- Planner `LaneAwareNavfn` chỉ cấm ô LETHAL (254), là chỗ lidar chạm thân xe. Vùng inflation 0.35 m chỉ là chi phí mềm.
  Planner còn bị kéo về tim lane (`lane_center_weight: 12`) và đây là lối duy nhất.

Với Nav2 thì đường đó hợp lệ. Traffic từ chối plan (`TrafficPlanRejected rev=3 reason=Capacity` lặp lại mỗi 2 s),
nhưng **Nav2 không biết lý do từ chối nên cứ gửi lại đúng đường đó**, không bao giờ tìm đường rộng hơn. Trên web,
dải plan và icon robot đều vẽ rộng nên trông như "đi xuyên qua" RBT-002, thực ra là lách sát bên dưới.

### 3.3 Khóa cứng khi hai xe đứng gần nhau

Khi RBT-001 dừng ở (-0.35, -0.93), cách RBT-002 0.63 m:

- Vùng quét **ở chính điểm xuất phát** của RBT-001 (bán kính 0.44 m) chạm các ô dưới thân RBT-002.
- Ngược lại, vùng quét xuất phát của RBT-002 cũng chạm ô dưới thân RBT-001.

Kết quả: **dù đi hướng nào, kể cả lùi ra xa, cũng không xe nào được cấp phép**. Đã thử lái tay cả hai xe và cả hai
đều đứng `Waiting`. Chỉ gỡ được bằng cách đặt lại vị trí xe (restart Gazebo).

Lần trước đã thử "thu nhỏ vùng quét ở điểm đầu" (start-taper), nhưng phải revert. Gateway kiểm tra thân xe + 0.05 m
tại vị trí thật phải nằm trong các ô được cấp, và chỉ còn dư 1.25 cm, nên bị lỗi `OUTSIDE_RESERVATION`.

### 3.4 RobotCare nhường đường không giúp được

`RobotCareService.YieldIdleBlockersAsync` bắt robot **rảnh** đang chắn đường dạt sang chỗ khác. Lần này nó hỏng 2 lần:

1. **Không coi RBT-002 là rảnh**, vì RBT-002 còn bị job cũ J191126035 (RECOVERY_REQUIRED) giữ assignment. Đã cancel
   job đó (được người dùng đồng ý).
2. **Chọn sai đích.** Sau khi rảnh, RBT-002 được gửi về **Parking A**, vì hàm chọn đích lấy chỗ xa nhất theo
   **đường thẳng** tính từ robot đang chờ và đích của nó. Muốn tới Parking A thì RBT-002 phải đi xuyên qua chính
   RBT-001, nên backend báo `DEADLOCK_RISK` và huỷ lệnh sau 61 s. Hết cooldown 60 s thì nó lặp lại đúng lựa chọn này.

Ngoài ra, nhường đường chỉ được kích hoạt **sau khi** robot có việc đã bị chặn 5 s. Lúc đó nó đã chạy tới sát xe kia,
nên rơi vào đúng tình huống khóa cứng ở 3.3.

## 4. Diễn biến kiểm chứng (2026-11-20)

| Thời điểm | Sự kiện |
|---|---|
| 05:29 | Resume J201126001 → RBT-001 rời A, dừng ở (-0.35, -0.93), `Capacity` chờ RBT-002 |
| 05:37 | Cancel J191126035 → RobotCare gửi RBT-002 về Parking A → `DEADLOCK_RISK`, huỷ |
| 05:39 | Pause job, lái tay cả 2 xe → cả 2 `Waiting` (khóa cứng) |
| ~05:50 | Restart Gazebo, 2 xe về bãi. Cho **RBT-002 rời B trước** lên vùng kệ B-2 (60 s, không chờ) |
| sau đó | Resume job → RBT-001 tới Inbound trong khoảng 55 s, `MOVE_TO_INBOUND_AREA` COMPLETED |

## 5. Vận hành tạm thời

- Khi cả hai bãi có xe mà xe ở **A** nhận việc: cho xe ở **B** rời bãi trước (lệnh navigate tay hoặc giao việc cho nó trước).
- Nếu đã khóa cứng (cả hai `Waiting`, không có `cycles` trong snapshot): pause job, restart Gazebo hoặc đặt lại pose,
  cho xe B ra trước, rồi resume.

## 6. Đề xuất sửa

| Hướng | Nội dung | Ưu điểm | Nhược điểm |
|---|---|---|---|
| **C. Điều phối (backend)** | (a) Chọn đích nhường đường theo **plan thật** của robot đang chờ (`proposedPath` trong snapshot): loại đích mà đường tới đó cắt qua robot đang chờ. (b) Kích hoạt nhường đường **ngay khi plan bị chặn**, trước khi robot có việc tiến sát. (c) Khi điều phối, ưu tiên giao việc cho xe ở phía cửa ra (B) | Chỉ sửa backend, nhanh | Không giúp khi cả hai xe đều đang có việc |
| **A. Costmap biết traffic (robot)** | Gateway publish footprint của robot khác (đã nới theo biên traffic) thành một layer LETHAL. Nav2 tự vòng khi còn chỗ. Khi hết chỗ thì chờ, không báo lỗi | Bền, xử lý tận gốc 3.2 | Sửa repo robot, phải giữ parity với backend |
| **B. Giảm độ khắt khe** | `PathTolerance` 0.15 → 0.10 m (đồng bộ cả gateway) | Đơn giản | Giảm biên an toàn, có nguy cơ `OUTSIDE_RESERVATION` |
| **D. Map** | Dời Parking B lên trên, hoặc giãn A–B, hoặc mở rộng hành lang đáy để tâm đường cách bãi ≥ 0.75 m | Hết điểm nghẽn | Phải sửa world Gazebo và map thật |

Đề xuất thứ tự: **C trước** (nhanh), **A** cho lâu dài, **D** khi chỉnh lại layout kho.

## 7. Thay đổi kèm theo: hiển thị lane trên map

Theo yêu cầu, lane giờ vẽ **nhiều mũi tên nhỏ, mảnh** thay cho vài mũi tên lớn. Áp dụng cho cả map giám sát lẫn Map Editor.

- `web/src/shared/map/laneGlyphs.ts`:
  - `LANE_ARROW_PATH` đổi thành mũi tên kiểu "→" (thân mảnh, đầu ngắn).
  - Kích thước và khoảng cách theo bề rộng lane: một chiều `ONE_WAY_SIZE 0.42`, `ONE_WAY_SPACING 0.85`; hai chiều `TWO_WAY_SIZE 0.32`, `TWO_WAY_SPACING 0.7`.
- Test: `laneGlyphs.test.ts` thêm ca "arrows are small and dense". `npx vitest run src/shared/map src/features/robots src/features/maps`: 80 passed. `npx tsc -b`: OK.

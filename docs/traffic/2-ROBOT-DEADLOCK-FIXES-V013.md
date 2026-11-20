# Sửa kẹt 2 robot trên MAP-ONE-V013 và hiển thị plan kiểu OTTO

Ngày: 2026-11-19 · Phạm vi: backend Fleet/Traffic, WorkflowExecution, web Fleet map

## 1. Bối cảnh

Khi chạy Transport Request INBOUND 6 container với 2 robot trên Gazebo (MAP-ONE-V013), job liên tục bị kẹt.
Robot đứng chờ nhau dù **thực tế không có xung đột vật lý**. Trên web chỉ thấy `Capacity @ cell:-1:-10 (+403)`,
một thông báo không nói được robot đang thật sự chờ cái gì.

Kết quả sau khi sửa: **R191126016 COMPLETED trong 527.8 s**. Cả 2 job đạt 9/9 bước, khoảng cách tối thiểu giữa
2 robot là 0.815 m, không có tài nguyên nào bị 2 robot cùng giữ, và 2 robot chạy song song 115.8 s.

## 2. Các lỗi tìm ra và cách sửa

### 2.1 Zone single-occupancy bị khóa "ảo" (backend Traffic)

**Hiện tượng:** RBT-002 đứng ở Inbound, cách mép `ZONE-SINGLE-WAIT-ZONE` 0.18 m, vẫn bị coi là đang giữ zone này.
RBT-001 cách zone 0.43 m và đang đi ra xa zone, nhưng vẫn bị coi là cần zone này. Kết quả là RBT-001 đứng chờ mãi.

**Nguyên nhân:** khi xét zone, backend dùng `ReserveRadius = thân xe 0.234 + PathTolerance 0.15 + ½ bước lấy mẫu ≈ 0.41 m`.
Mức nới này hợp lý cho ô cell, nhưng áp lên zone thì xe chỉ cần đi sát mép là đã khóa cả zone.

**Sửa:**
- Thêm `Traffic:SemanticZoneMarginMeters` (bật `0.08` trong `appsettings.json`).
- Có cấu hình này thì zone chỉ tính theo `FootprintRadius + 0.08 + ½ bước` (khoảng 0.33 m).
  Giá trị này **không bao giờ nhỏ hơn** thân xe + biên dừng 0.05 m mà gateway kiểm tra, nên xe không bao giờ chạm zone chưa được cấp.
- Không có cấu hình thì giữ hành vi cũ. Test đối chiếu `SemanticCellsParityTests` với robot vẫn khớp, nên **không phải sửa code Python của gateway**.

File: `SemanticReservation.cs` (`ZoneReserveRadiusMeters`), `TrafficOptions.cs`, `appsettings.json`.

### 2.2 Robot đang chờ "ôm" các ô chưa đi vào (backend Traffic)

**Hiện tượng:** RBT-001 lùi về Parking A để nhường đường, sau đó đứng chờ. RBT-002 đi ở hành lang ngay phía trên,
cách 0.9 m và có tường ngăn. Backend báo `DEADLOCK_RISK`, và RBT-002 hết giờ (`NAVIGATION_TIMEOUT`).

**Nguyên nhân:** khi bị thu hồi cấp phép, robot vẫn giữ mọi ô nằm trong plan mới, kể cả những ô chưa hề đi vào.
Dải ô RBT-001 giữ (tới y = -0.5) chồng đúng 1 hàng ô với dải RBT-002 cần, nên thành vòng chờ không ai phá được.

**Sửa:** trong `TrafficState.AcquireSemanticPlan`, robot **không có grant trước lần đề xuất này** và đang `Waiting`/`Idle`
(gate đã khóa nên chắc chắn đứng yên) chỉ giữ phần dưới thân xe (`ResourcesUnder(pose)`). Robot đang chạy mà replan
thì giữ nguyên hành vi cũ.

Test: `SemanticWaitingOccupancyTests`.

### 2.3 Bộ giải deadlock bỏ qua robot đang lùi vô thời hạn (WorkflowExecution)

**Nguyên nhân:** `ResolveDeadlocksAsync` có điều kiện "một trong 2 robot đang lùi thì bỏ qua". Nếu chính chặng lùi đó
cũng bị chặn thì không ai can thiệp nữa.

**Sửa:** `RetreatStillFresh` chỉ bỏ qua trong 2 × `DeadlockCooldownSeconds` (60 s). Quá thời gian đó, hoặc không rõ
thời điểm bắt đầu lùi (backend vừa restart), thì giải deadlock lại như bình thường.

### 2.4 Chặng lùi nhường đường bị kẹt khi docking vào bãi (WorkflowExecution)

**Hiện tượng:** RBT-001 lùi về Parking A, bước travel dừng lệch 12 cm khỏi trục bãi nhưng vẫn báo xong. Sau đó bước
`run_in 0.25m reverse` bị gate chặn (`OUTSIDE_RESERVATION`), xe docking lại 2 lần vẫn thất bại.

**Sửa:** chặng lùi gửi `positionTolerance = max(dung sai endpoint, 0.35 m)`. Gateway bỏ qua `run_in` khi xe đã ở trong
dung sai, nên xe chỉ cần dạt ra khỏi đường, không cần vào hẳn ô đỗ.

**Còn tồn tại (repo robot):** `docking_max_approach_retries: 0` trong `robot_gateway_sim01/02_semantic_active.yaml` và
`robot_gateway_semantic.yaml` tắt việc căn lại khi xe lệch trục quá `docking_approach_lateral_m`. Khi robot về bãi
bình thường (không phải chặng lùi) thì lỗi này vẫn có thể xảy ra. Cần team robot quyết định có bật lại (mặc định trong code là 2) hay không.

### 2.5 Dữ liệu map: `EP-PARKING-B` sai loại

`EP-PARKING-B` trên MAP-ONE-V013 có loại `WAYPOINT`. RobotCare chỉ coi robot đứng ở endpoint `PARK` là đã về bãi,
nên cứ kéo RBT-002 sang `EP-WAIT`. Đã sửa **trực tiếp trong DB dev** thành `PARK`. Nếu seed lại map thì cần sửa cả trong seed/map editor.

## 3. Hiển thị plan của robot (web)

Cập nhật 2026-11-20: theo yêu cầu, plan chỉ còn **một đường mảnh** cho mỗi robot. Đã bỏ dải rộng bằng thân xe,
mũi tên, vòng quanh robot và khung đích.

| Thành phần | Ý nghĩa |
|---|---|
| Màu đường | Mỗi robot một màu (`PLAN_COLORS`, theo thứ tự mã robot) |
| Đoạn đậm | Đoạn traffic **đã cấp phép** (`grantedPathPoints`) |
| Đoạn nhạt | Đoạn **đang chờ** traffic |

Backend (`TrafficState.PlanView`) gửi cả phần plan còn lại tính từ vị trí robot, đã lược còn các điểm cách nhau khoảng
5 cm, kèm `grantedPathPoints`. Nhờ vậy robot đang chờ vẫn hiện đường đi chứ không bị trống như trước.

**Dòng thông báo chờ:** `summarizeTrafficWait` chọn tài nguyên **thật sự đang bị robot khác giữ**, ưu tiên zone.
Ví dụ: `RBT-001 đang chờ RBT-002 · Capacity @ ZONE-SINGLE-WAIT-ZONE (+350)`.

## 4. Luồng dữ liệu

```
Nav2 (robot) ──traffic_plan──> robot_gateway ──MQTT──> backend TrafficState.AcquireSemanticPlan
                                                         ├─ CollectResources (cell: ReserveRadius, zone: ZoneReserveRadius)
                                                         ├─ robot đứng chờ → chỉ giữ phần dưới thân xe
                                                         └─ Grant / Wait / DeadlockRisk
backend TrafficState.Snapshot ──/api/fleet/traffic/snapshot──> web useTrafficOverlay
        (proposedPath + grantedPathPoints)                         ├─ buildTrafficOverlay → WarehouseMap (dải plan)
                                                                   └─ summarizeTrafficWait → callout chờ
JobExecutionEngine.ResolveDeadlocksAsync ──retreat (tolerance 0.35 m)──> robot dạt ra, không docking
```

## 5. Kiểm chứng

- `dotnet test backend/tests/WaroTrans.UnitTests`: 922 passed (thêm `Zone_margin_*` và `SemanticWaitingOccupancyTests`).
- `npx vitest run src/features/robots`: 69 passed. `npx tsc -b`: OK.
- E2E Gazebo (headless, MAP-ONE-V013, RealRobot profile): R191126016, 6 container, 2 job, COMPLETED.

Lệnh chạy backend dùng cho test (biến môi trường quan trọng):

```
Traffic__Mode=Semantic
Traffic__SemanticMapDirectory=<robot repo>/ros2_ws/src/warotrans_simulation/maps/map_one_v013
Traffic__SemanticCellSizeMeters=0.10  Traffic__SemanticPrefixGrant=true  Traffic__SemanticZoneMarginMeters=0.08
Mqtt__CommandAckTimeoutSeconds=25
Traffic__RobotHomeEndpoints__RBT-001=EP-PARKING-A  Traffic__RobotHomeEndpoints__RBT-002=EP-PARKING-B
```

## 6. Còn tồn tại

1. `docking_max_approach_retries: 0` ở gateway (mục 2.4).
2. `EP-SHELF-B-2`: điểm lấy đà nằm trong vùng `NO_STOP`, nên test đã bỏ kệ này. Cần chỉnh map.
3. Parking A và Parking B chỉ cách nhau 0.85 m. Lối vào Parking B từ phía tây chạm vùng dự trữ của xe đang đỗ ở A. Nên giãn 2 bãi ra hoặc đổi hướng tiếp cận.
4. Ô cell không biết có tường: hai robot ở hai bên tường vẫn có thể bị coi là chồng ô.

## 7. Rà soát các thay đổi Antigravity để lại (2026-11-20)

Trong cùng việc này, Antigravity đã sửa trước một số chỗ nhưng không viết test. Sau khi rà soát, các chỗ dưới đây đã được chỉnh lại:

| Chỗ | Vấn đề | Đã sửa |
|---|---|---|
| `IssueCancelCommandHandler.CancelOrphanAsync` | Bỏ qua lệnh đã `Canceled`: robot vẫn chạy một lệnh mà backend đã huỷ (lúc robot offline) sẽ **không bao giờ bị bảo dừng**. Ngoài ra, đã từng có CANCEL là không bao giờ gửi lại, kể cả khi CANCEL đó thất bại hoặc hết giờ | Tách logic thành `OrphanCancelDue`. Gửi CANCEL bất kể kết quả của lệnh đã đóng. Có 10 s ân hạn (`OrphanGrace`) sau khi lệnh đóng. Không gửi khi đang có một CANCEL còn chạy hoặc vừa gửi chưa tới 10 s. CANCEL thất bại hoặc hết giờ thì gửi lại |
| `ProcessRobotCommandResultHandler` | Comment ghi "CANCEL do backend yêu cầu" nhưng code không kiểm tra ai huỷ | Sửa comment cho đúng: mọi `CANCELED` có pose mới và đã định vị đều là dừng sạch, chỉ dựa vào bằng chứng pose |
| `JobExecutionEngine`: chặng lùi gặp `AUTHORITY_ALREADY_HELD` / `QUARANTINED:…:NAVIGATION_CANCELED` | Thử lại mãi, không giới hạn. Chuỗi lý do so khớp cứng | Dùng chung `RetryLaterAsync`: thử lại mỗi 1 s, quá `TransientRetryLimitSeconds` (60 s) thì bước fail với `transient_retry_timeout`. Lý do lỗi được nhận diện qua `IsRetreatHandoverReason` |
| `JobExecutionEngine`: MOVE gặp `robot_busy` / `DbUpdateConcurrencyException` | Mọi MOVE gặp `robot_busy` đều chờ vô hạn. `ChangeTracker.Clear()` chạy cả với `robot_busy`, nên có thể bỏ các thay đổi chưa lưu mà không báo | `robot_busy`: thử lại trên dữ liệu đang có, không xoá tracker. Chỉ khi xung đột ghi mới xoá tracker và nạp lại job. Cả hai đều có giới hạn 60 s. Bước chờ được đánh thức qua `RetryWaitSinceKey`. Key này bị xoá khi NAVIGATE được gửi đi hoặc khi bước chuyển sang chờ vùng |
| `JobExecutionEngine.RetreatAsync` | `EP-WAIT` bị viết cứng trong code | Đưa ra cấu hình `Traffic:DeadlockRetreatEndpointCodes` (`appsettings.json`: `"EP-WAIT"`). Để trống thì chỉ lùi về bãi và các điểm `EP-QUEUE*` |

Test thêm:
- `CancelOrphanTests` (8 ca).
- `JobExecutionEngineTests`:
  - `A_busy_robot_makes_the_move_retry_…`
  - `A_robot_that_stays_busy_fails_the_move_…`
  - `Only_a_retreat_handover_refusal_is_retried`
  - `Extra_deadlock_retreat_endpoints_come_from_configuration`

Kết quả: `dotnet test backend/tests/WaroTrans.UnitTests`: 938 passed.

Các thay đổi còn lại của Antigravity được giữ nguyên vì đúng hướng:
- RobotCare huỷ việc về bãi khi robot đó đang deadlock.
- Đổi xe phải lùi khi xe được chọn không có chỗ lùi.
- Kiểm tra keepout trước khi ghi plan.

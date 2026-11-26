# Kế hoạch: cấp đường từng đoạn và robot bớt nhạy (hai robot, MAP-ONE-V024)

Ngày 2026-11-25. Xuất phát từ lab cùng ngày (`LAB_2026-11-25_V024_TWO_ROBOTS.md`):
- tỉ lệ thời gian hai robot cùng chạy chỉ 2–24 %;
- robot né nhau quá xa, dù còn cách nhau khá xa;
- việc chờ nhau bị biến thành lỗi `NAVIGATION_BLOCKED`.

Mục tiêu:
- robot **đi được bao nhiêu thì đi bấy nhiêu**;
- **dừng chờ ngắn trên lane** (hoặc lùi một chút) cho robot kia qua;
- **không né xa** khi hai robot chưa thật sự gần nhau;
- an toàn giữ nguyên: dừng khẩn dưới 6 cm, collision monitor vẫn hoạt động.

## Hiện trạng (đã đọc code)

| Chỗ | Hiện tại | Hệ quả |
|---|---|---|
| Host: cấp đường | `SemanticPrefixGrant=false`, horizon 20 m: cấp **trọn quãng đường** hoặc không cấp | Robot thứ hai đứng tới khi đường robot kia trống hẳn |
| Host: cấp từng đoạn | Đã có (`GrantablePrefix`). Lỗi đứng chết A1/A2 (WTCP-218) **đã sửa trong develop**: Host xét lại hàng chờ mỗi nhịp (`RetrySemanticWaiters`), robot hỏi lại sau 2 s khi bị giữ ở cuối đoạn (`held_repropose_sec`) | Bật lại được, nhưng đoạn cấp hiện có thể dừng **ở bất kỳ đâu**, kể cả giữa ngã ba hay trong hành lang hai chiều |
| Robot: costmap toàn cục | Có `fleet_layer` (robot kia = thân + 5 cm) cộng vùng phình 0.35 m | **Planner vẽ đường vòng xa** quanh robot kia: đây là chuyện "né ra xa" |
| Robot: costmap cục bộ + RPP | `fleet_layer` + kiểm tra va chạm của RPP (1.0 s phía trước) | Dừng khi thật sự sắp chạm: đúng, giữ |
| Robot: collision monitor | Đa giác `approach` (0.7 s trước khi chạm), nguồn: scan + fleet | Lớp an toàn cuối: giữ |
| Gateway | 60 s không tiến được thì báo `NAVIGATION_BLOCKED` | Chờ nhau thành lỗi. Hiện Host tự chạy tiếp sau 15 s (PR #109), nhưng đó chỉ là chữa cháy |

## Giai đoạn 1 — Robot bớt nhạy (robot, khoảng nửa ngày)

1. **Bỏ `fleet_layer` khỏi costmap toàn cục**, chỉ giữ ở costmap cục bộ và collision monitor.
   - Planner không vẽ đường vòng tránh robot kia nữa. Việc tách hai robot do traffic trên Host lo: mỗi robot giữ dải
     đường của mình, robot đứng yên giữ ô dưới thân nó.
   - Sửa trong `nav2_params_fleet.yaml`, dùng chung cho cả hai robot.
2. **Robot kia trong costmap cục bộ = đúng thân xe**: margin 5 cm → 2 cm (`fleet_obstacles.py`). RPP chỉ dừng khi
   đường đi thật sự cắt qua thân robot kia trong khoảng 1 s tới.
3. **Gateway phân biệt "chờ robot" với "bị chặn"**: trong cửa sổ 60 s, nếu chướng ngại phía trước là robot của đội
   (điểm `/fleet_obstacles` trong vùng 0.6 m trước mũi xe), gateway:
   - không đếm thời gian, không báo `NAVIGATION_BLOCKED`;
   - báo `HELD_BY_ROBOT` trong tiến độ;
   - nhưng đếm riêng, quá 3 phút thì vẫn báo lỗi để người xem.

   Khi đó PR #109 (tự chạy tiếp) chỉ còn là lưới an toàn.

**Kiểm:**
- unit test gateway (đồng hồ giả);
- sim: hai robot đi ngược chiều trên hai lane song song không chậm lại;
- lab: S4 không còn dừng vì `NAVIGATION_BLOCKED`, và thân hai xe vẫn cách nhau ít nhất 0.15 m.

## Giai đoạn 2 — Cấp từng đoạn, chỉ dừng ở chỗ chờ hợp lệ (Host, 1–1.5 ngày)

1. **Bật `SemanticPrefixGrant=true`** (horizon khoảng 1.5 m, tức đoạn xin thêm mỗi lần). Thêm luật: **đoạn được cấp
   chỉ được kết thúc ở chỗ dừng hợp lệ**:
   - trên lane (mọi ô của lane ONE_WAY), ở QUEUE, PARK, hoặc ô sàn trống ngoài zone;
   - **không** trong zone khoá (SINGLE_OCCUPANCY) mà robot không giữ trọn, **không** trong NO_STOP, **không** ở ngã ba.
   - Cắt đoạn lùi về chỗ dừng hợp lệ gần nhất trước điểm xung đột (`GrantablePrefix` → `LastSafeStop`).
2. **Ngã ba / hành lang hai chiều hẹp → khoá cả zone.**
   - Trên V024 cần thêm 2 zone SINGLE_OCCUPANCY: **hành lang trái** (cột PARKING / CHARGE / PARKING-B, đoạn từ
     QUALITY-INSPECTION xuống) và **cửa QUEUE → BOUND-1/2**.
   - Hai robot gặp nhau ở đó thì một robot đứng chờ **ngoài** zone, không đối đầu bên trong.
   - Cần bạn vẽ hai zone này trên trình chỉnh map (hoặc tôi thêm qua DB như lần trước).
3. **Nhả ngay đoạn đã đi qua**: đo lại (log `released`) xem ô phía sau robot có được nhả theo pose không. Nếu chưa
   thì nhả theo tiến độ, giữ lại phần thân xe.
4. Giữ `GoalQueueEndpoints` / `GoalCorridors` (QUEUE cho INBOUND / OUTBOUND) như hiện tại.

**Kiểm:**
- unit test `LastSafeStop` (ngã ba, NO_STOP, zone khoá);
- sim harness `test_flows` với 6 kịch bản;
- lab: S3, S4, M1.

## Giai đoạn 3 — Lùi một chút để nhường trên lane (Host + robot, khoảng 1 ngày)

Khi robot A **đứng** (chờ hoặc rảnh) trên đúng ô mà robot B cần, và B không có đường khác:
- Thay vì đưa A đi tới một endpoint xa (cách hiện tại), Host gửi A lệnh **lùi ngắn** về chỗ dừng hợp lệ gần nhất phía
  sau nó: tối đa 0.4 m, dọc lane, ngược chiều mũi xe.
- Dùng lại cơ chế lùi đang có (`retreat`) với một đích mới là `LastSafeStop` phía sau.
- A lùi xong thì B qua, rồi A đi tiếp với đoạn được cấp mới.
- Chỉ áp dụng trên lane và ô sàn trống. Trong zone khoá thì đã có luật ngoài zone (giai đoạn 2).

**Kiểm:** sim (đối đầu ở cửa QUEUE), rồi lab M1 và M2.

## Giai đoạn 4 — Ưu tiên (Host, nửa ngày)

Khi hai robot cùng xin một đoạn: **robot đang chở hàng** đi trước, rồi tới **robot đi lấy hàng**, cuối cùng là
**robot rảnh hoặc đang về đỗ**. Nếu ngang nhau thì ai xin trước đi trước (FIFO). Luật này chốt một lần cho mỗi lượt
chờ, không tính lại liên tục (tránh lỗi A5 đổi qua đổi lại).

## Tiêu chí đạt (lab, hai robot thật, V024)

| Chỉ số | Hiện tại | Mục tiêu |
|---|---|---|
| Hai robot cùng chạy (S3 / S4 / M1) | 2 / 7 / 20 % | **≥ 40 %** |
| M1 (6 thùng) | 218 s | **≤ 170 s** |
| Job dừng vì `NAVIGATION_BLOCKED` | 2 lần / 9 kịch bản | **0** (không cần tự chạy tiếp) |
| Thân xe gần nhất | ≥ 0.26 m | ≥ 0.15 m, không dừng khẩn |
| Robot né đường vòng khi robot kia còn cách hơn 0.5 m | có | không |
| M2, M3, M4 | chưa chạy | đạt |

## Thứ tự và rủi ro

- **Thứ tự:** giai đoạn 1 → đo lab → 2 → sim → lab → 3 → 4. Mỗi giai đoạn một nhánh tách từ develop (cả system lẫn
  robot), có test, PR riêng. Robot deploy qua `sync_from_rbt1.py` để hai robot luôn chạy cùng code.
- **Rủi ro giai đoạn 1:** planner có thể vẽ đường đi xuyên qua robot đang đứng yên. Đỡ bằng: traffic giữ ô dưới thân
  robot đứng yên (Host không cấp đường xuyên qua), costmap cục bộ và collision monitor vẫn thấy nó (dừng trước khi
  chạm).
- **Rủi ro giai đoạn 2:** cấp từng đoạn có thể đưa lại lỗi đứng chết. Đỡ bằng: luật "chỉ dừng ở chỗ hợp lệ", A1/A2 đã
  sửa, và đo thời gian chờ gia hạn.
- **Rủi ro deadlock:** hai đoạn cấp gặp nhau trong hành lang hai chiều. Đỡ bằng: hành lang hai chiều hẹp phải là zone
  khoá (giai đoạn 2.2); bộ gỡ deadlock cũ vẫn giữ làm lưới an toàn.

## Cần bạn quyết

1. Đồng ý bỏ `fleet_layer` khỏi costmap toàn cục (giai đoạn 1.1)? An toàn vẫn do costmap cục bộ, collision monitor và
   driver dừng khẩn dưới 6 cm.
2. Thêm 2 zone khoá trên V024 (hành lang trái, cửa QUEUE): bạn vẽ trên web, hay tôi thêm qua DB?
3. Ngưỡng lùi tối đa khi nhường: 0.4 m có ổn không?

## Trạng thái triển khai (2026-11-25, tối)

Quyết định của bạn: giữ robot kia trong costmap toàn cục nhưng thu nhỏ; NO_STOP vẽ thẳng vào V024, trừ khu SHELF-B.

| Phần | Nhánh | Trạng thái |
|---|---|---|
| 1.1 Costmap toàn cục: robot kia = INSCRIBED (253, không phình) + 0.20 m | warotrans `feature/fleet-less-sensitive` | Xong, có test; **chưa build / deploy lên Pi** (robot đang tắt) |
| 1.2 Margin thân xe 5 → 2 cm | như trên | Xong |
| 1.3 `[HeldByRobot]`: có robot trong 0.8 m, ±70° phía trước thì cửa sổ 60 s không chạy (tối đa 180 s) | như trên | Xong, pytest 463 pass |
| rbt2 đồng bộ | warotrans-rbt2 `feature/fleet-less-sensitive` | Đã sync, pytest pass |
| 2.1 `SemanticPrefixGrant=true` (profile RealRobot) | system `feature/prefix-grant-safe-stops` | Xong |
| 2.2 Đoạn cấp tính đường robot kia **từ vị trí hiện tại** (trước đây tính cả phần nó đã đi qua) + cho nối đuôi cùng chiều | như trên | Xong. Test mới chứng minh lỗi: trước khi sửa robot sau chỉ được tới y = 0.1, sau khi sửa > 2 m |
| 2.3 NO_STOP trên V024 (DB, đã backup `warotrans_postgres_before_v024_nostop_*`) | DB + bundle `map_one_v024` | `ZONE-NO-STOP-YARD` (x 0.45–1.80, y −3.95 → −3.25) và `ZONE-NO-STOP-LANE-A2-EXIT` (x 0.65–1.05, y −0.30 → 0.05). Không chạm endpoint / pre-goal nào. Bundle mới **fingerprint `42645d72`** |
| 4 (phần đơn giản) Robot đang làm Job đi trước robot rảnh / đang về đỗ | system, như trên | Xong (ưu tiên 1 so với 0; aging 0.1/s nên robot rảnh không bị bỏ đói) |
| 3 Lùi ngắn trên lane, 4 "đang chở hàng" | — | Chờ số đo lab |

**Trước khi chạy lab:** deploy bundle `42645d72` + code lên **cả hai** Pi (colcon build `warotrans_fleet_layer`, `warotrans_fleet`), khởi
động lại Host. Host và robot phải cùng fingerprint, nếu không traffic từ chối plan.

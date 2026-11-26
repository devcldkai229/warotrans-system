# Lab 2026-11-25 — hai robot thật trên MAP-ONE-V024: kết quả, lỗi, việc tiếp theo

Phạm vi: RBT-001 và RBT-002 chạy trên sàn thật, map **MAP-ONE-V024**. Map được quét từ web bằng RBT-001; zone và lane do
người dùng vẽ. Backend chạy develop, cộng các nhánh trong mục 5.

Traffic: mỗi robot giữ dải đường nó sắp quét qua. Ba zone khoá cả zone (SHELF-A, SHELF-B, CENTER); có 6 lane một chiều.
Host cấp trọn đường một lần (horizon 20 m, không cấp từng đoạn). Driver test là
`warotrans/tools/traffic_e2e/real_two_robot_run.py`: nó tự xác nhận các bước của nhân viên và dừng khẩn nếu thân hai
xe cách nhau dưới 6 cm.

## 1. Kết quả các chuyến

| Kịch bản | Nội dung | Kết quả | Thời gian | Thân xe gần nhất | Hai robot cùng chạy |
|---|---|---|---|---|---|
| S1 (lần 1) | RBT-001 INBOUND → SHELF-A-1 | ❌ không rời được INBOUND (lỗi 1) | — | — | — |
| S1 | như trên, sau khi sửa map | ✅ | 120 s | 0.71 m | 24 % |
| S2 | RBT-002 INBOUND → kiểm tra chất lượng → SHELF-B | ✅, cần **1 lần chạy tiếp bằng tay** (lỗi 2, 3, 4) | 316 s | 0.26 m | 14 % |
| S3 | hai robot cùng INBOUND, đi SHELF-C và SHELF-A-2 | ✅ | 199 s | 0.73 m | 2 % |
| S4 | R1 xuất kho A-1 → OUTBOUND, R2 chuyển kệ B → C (đường cắt nhau) | ✅ | 225 s | 0.56 m | 7 % |
| S5 | 1 TR 3 thùng (gộp thành 1 chuyến, 1 robot) | ✅ | 180 s | 0.29 m | 11 % |
| S6 | 3 TR 1 thùng, dispatcher chia R2 → R1 → R2 | ✅, cần **1 lần chạy tiếp bằng tay** (lỗi 4) | 295 s | 0.44 m | 5 % |
| M1 (lần 1) | 1 TR **6 thùng**, 2 chuyến × 3 thùng, 2 robot | ✅ nhưng chậm (lỗi 5, 6) | **445 s** | 0.61 m | 13 % |
| M1 (lần 2) | như trên, robot chờ ở QUEUE, SHELF-B đã dời | ✅ | **218 s** | 0.55 m | 20 % |
| M2, M3, M4 | chuyển kệ 6, xuất kho 6, 2 TR có kiểm tra chất lượng | chưa chạy (dừng để đổi Wi-Fi) | | | |

- Không lần nào dừng khẩn, và không va chạm.
- Mục "hai robot cùng chạy" là tỉ lệ thời gian cả hai cùng di chuyển, trong tổng thời gian có ít nhất một robot di
  chuyển. Con số này **thấp ở mọi kịch bản** (2–24 %): phần lớn thời gian một robot đứng chờ robot kia. Đây là việc
  lớn nhất còn lại (mục 4).

## 2. Lỗi đã tìm ra và trạng thái

| # | Lỗi | Bằng chứng | Trạng thái |
|---|---|---|---|
| 1 | Vạch cấm `ZONE-KEEP-OUT-SHELF-A` (x 0.875–1.957), sau khi phình cho bộ lập đường, phủ luôn **điểm chờ trước kệ SHELF-A-1** (2.087, −0.678). Nav2 báo lỗi 208 (không có đường), robot đứng ở INBOUND 60 s rồi job dừng | Gọi `compute_path_to_pose` trên robot: tới điểm chờ thì hỏng, mọi đích khác đều có đường | ✅ **Đã sửa map**: vạch dừng ở x 1.60 (sửa trực tiếp V024 trong DB, bundle fp `7a3edca6`). ⚠️ Trình chỉnh map chưa cảnh báo khi điểm chờ trước kệ nằm trong vùng cấm |
| 2 | Robot rảnh **nhường đường chạy tới một kệ** (EP-SHELF-A-1), mà đó lại là kệ robot kia sắp tới | Log: `RBT-002 (idle) makes way for RBT-001: going to EP-SHELF-A-1` | ✅ PR #109: chỉ né tới PARK/QUEUE hoặc ô sàn trống. ⚠️ **Còn sót**: khi đường thẳng tới QUEUE cắt qua robot kia, kệ vẫn là phương án cuối (đã thấy một lần lúc gỡ tráo nhà) |
| 3 | Robot rảnh về **PARK gần nhất** thay vì nhà của nó (RBT-001 về PARKING-B), nên đứng chắn hành lang của RBT-002. Sau đó hai robot **tráo nhà** và lặp "về chỗ đỗ" mỗi 5 s | Positioning intents 06:13; log lặp 06:30–06:32 | ✅ PR #109: về nhà mình trước; đứng ở nhà robot khác thì vẫn về nhà mình; nhà bị chiếm thì đứng yên (hết lặp) |
| 4 | **Chờ nhau bị biến thành lỗi**: gateway thấy 60 s không tiến được thì báo `NAVIGATION_BLOCKED`, và job dừng chờ người. Nguyên nhân thường là robot kia đứng gần đường đi: costmap và bộ chống va của robot thấy nó, còn traffic trên Host lại cho đi | S2, S6: chạy tiếp tay xong thì 11 s sau tới nơi | 🟡 **Giảm nhẹ**: PR #109 tự chạy tiếp sau 15 s, tối đa 3 lần mỗi bước. ⬜ Gốc chưa sửa: Host và costmap robot đánh giá "đường trống" khác nhau |
| 5 | Đích đang bận (INBOUND) thì robot thứ hai **đứng chờ ở nhà**, đợi robot kia rời INBOUND mới xuất phát | Log: `goal EP-INBOUND is taken …; robot waits where it stands` | ✅ Cấu hình (PR #108): `GoalQueueEndpoints` EP-INBOUND / EP-OUTBOUND = EP-QUEUE, và `GoalCorridors` cho khu INBOUND / OUTBOUND. M1: **445 s → 218 s** |
| 6 | **Kệ SHELF-B nằm quá sâu trong hốc**: mũi xe còn khoảng 5 cm tới tường, bộ chống va dừng xe, mất 138 s cho một lần cất | M1 lần 1 | ✅ Dời EP-SHELF-B (2.531, −2.462) → (2.43, −2.42) trong DB |
| 7 | Trang Monitor → Fleet **khoá cứng map v19 (archived)** | ảnh chụp màn hình | ✅ PR #107: có ô chọn map; lựa chọn đã nhớ của map archived bị bỏ qua |
| 8 | Dựng map: chưa có nút **quét lại**. Sau khi thêm nút, "Quét lại" ngay sau khi dừng làm slam_toolbox không ra map (`MAPPING_NO_MAP`) | phiên `959d2e2e` | ✅ PR #106 (nút Quét lại + chờ 5 s). ✅ PR #27 (robot chờ slam thoát hẳn), **chưa deploy** lên Pi |
| 9 | CPU Pi rất tải (load average 15–17), EKF liên tục không kịp nhịp | `top`, log EKF | ⬜ Chưa xử lý (gateway khoảng 45 % CPU, evidence agent khoảng 18 %) |
| 10 | Mạng: mDNS chập chờn trên điểm phát. RBT-002 hai lần mất kết nối (11:41 nghi hết pin; 14:1x sau khi đổi Wi-Fi) | | ⬜ Theo dõi. Cả hai robot đã có Wi-Fi **FPTU_Lab** (RBT-001 10.3.84.180, RBT-002 10.3.84.84) |
| 11 | Dải giữ chỗ dọc đường đi rộng 0.5 m (0.25 mỗi bên): hai robot cách xa vẫn bắt nhau chờ | người dùng quan sát | 🟡 Đã thu xuống 0.40 m (PR #108), chưa đo riêng hiệu quả |

## 3. Bố trí map V024 — nhận xét

- **PARKING-A / CHARGE / PARKING-B** xếp thành một cột ngay trên **hành lang trái**, mà mọi chuyến từ PARKING-A
  xuống phía nam đều đi qua đó. Robot đỗ ở PARKING-B hay phải nhường đường (lỗi 2, 3 xuất phát từ đây). Nên dời
  PARKING-B sang hốc trống phía tây nam, hoặc biến hành lang trái thành lane một chiều.
- **QUEUE (0.55, −1.56)** đặt rất đúng chỗ: ngay đầu lane BOUND-1 xuống khu INBOUND / OUTBOUND, và không cản lane
  BOUND-2 đi lên. Cấu hình ở lỗi 5 dùng điểm này.
- **QUALITY-INSPECTION (0.45, −0.65)** sát vách giữa. Robot vào và ra được (S2), nhưng đó là đoạn hai robot hay chạm
  mặt trong hành lang trái.
- **SHELF-B** đã dời ra (lỗi 6). **SHELF-A-1 / A-2**: vạch cấm đã ngắn lại, vào được.
- **Sức chứa 3 thùng/chuyến**: TR 3 thùng chỉ ra 1 chuyến cho 1 robot. Muốn chia đều cho 2 robot thì TR phải có hơn 3
  thùng, hoặc giảm `MaxContainersPerJob`.

## 4. Cần cải thiện để chạy ổn định và năng suất hơn

Vấn đề chính: Host **giữ chỗ cả quãng đường** cho robot đang chạy, nên robot kia đứng yên tới khi đường đó trống
hẳn. Hướng cải thiện, ưu tiên từ trên xuống:

1. **Cho robot "đi được bao nhiêu thì đi bấy nhiêu" rồi dừng ở chỗ chờ hợp lệ trên lane.**
   - Bật lại **cấp từng phần** (prefix grant). Bug đứng chết cũ (A1/A2, WTCP-218) đã được sửa trong develop bằng
     zone-chain: Host xin lại định kỳ, robot hỏi lại sau 2 s.
   - Nhưng chỉ cho dừng ở **điểm chờ khai báo trên lane** (`holdPoses`, ví dụ đầu BOUND-1, giữa lane B-1), không dừng
     giữa ngã ba.
   - Cần một đợt test S3/S4/M1 riêng để so sánh với bản hiện tại.
2. **Lùi lại một đoạn ngắn để nhường** (khoảng 0.3 m về lane hoặc về QUEUE) khi robot kia cần đi qua chỗ nó đang
   đứng, thay vì đứng chặn rồi chờ 60 s. Đã có cơ chế lùi khi deadlock (`retreat`); cần mở rộng cho trường hợp
   "đứng chắn đường" giữa chuyến.
3. **Thống nhất "đường trống" giữa Host và robot (gốc của lỗi 4).**
   - Collision monitor và fleet layer trên robot chỉ nên dừng xe khi robot kia **thật sự gần** (vào vùng dừng), còn
     nằm trong dải Host đã cấp thì không coi là bị chặn.
   - Hoặc gateway gửi `HELD_BY_ROBOT` để Host biết đây là chờ, không phải lỗi, thay vì báo `NAVIGATION_BLOCKED`.
4. **Nhả chỗ đã giữ ngay sau robot** (đoạn đường robot đã đi qua) và đo lại tỉ lệ "hai robot cùng chạy". Mục tiêu
   trên 40 % ở S3/S4/M1.
5. **Ưu tiên robot đang chở hàng** khi tranh đường với robot rảnh hoặc robot đi lấy hàng.
6. **Kiểm tra map khi lưu**: cảnh báo endpoint hoặc điểm chờ trước kệ nằm trong vùng cấm phình, hay mũi xe cách tường
   dưới 10 cm (lỗi 1, 6).
7. **Giảm tải CPU Pi** (lỗi 9): hạ nhịp gateway và evidence agent, xem lại tần số EKF.
8. Bố trí lại PARKING-B (mục 3).

## 5. Code và PR

| Repo | PR | Nội dung | Trạng thái |
|---|---|---|---|
| warotrans-system | #106 | Nút Quét lại khi dựng map (+ chờ 5 s) | mở, chưa merge |
| warotrans-system | #107 | Ô chọn map trên Fleet monitor | mở |
| warotrans-system | #108 | Snapshot V024; profile RealRobot: V024, cấp trọn đường, dải 0.40 m, QUEUE / corridor cho INBOUND / OUTBOUND | mở |
| warotrans-system | #109 | Né đường đúng chỗ, về đúng nhà, hết lặp về đỗ, tự chạy tiếp khi `NAVIGATION_BLOCKED` | mở |
| warotrans | #27 | Dừng slam chờ thoát hẳn | mở, **chưa deploy** |
| warotrans | #28 | Bundle `map_one_v024` (+ vạch cấm ngắn), kịch bản test S1–S6 / M1–M4 | mở |
| warotrans-rbt2 | #5 | Mang `map_one_v024` sang RBT-002 | mở |

- Host đang chạy nhánh local `local/lab-20261125` (develop cộng các PR trên, chưa push). Hai Pi chạy develop cộng
  bundle V024.
- Sửa DB trực tiếp trên V024 (được người dùng cho phép): vạch cấm SHELF-A, vị trí EP-SHELF-B. Bản sao lưu trước khi
  sửa:
  - `infrastructure/snapshots/warotrans_postgres_before_v024_keepout_20261125.dump`
  - `infrastructure/snapshots/warotrans_postgres_before_shelfb_move_20261125.dump`

## 6. Việc tiếp theo

1. Đưa RBT-002 online lại trên FPTU_Lab, định vị cả hai robot, rồi chạy **M2, M3, M4**.
2. Merge các PR ở mục 5 vào develop, và deploy PR #27 lên hai Pi.
3. Làm mục 4.1 (cấp từng phần, chờ ở `holdPoses` trên lane) và 4.3 (thống nhất "đường trống"). Chạy lại S3, S4, M1 để
   so tỉ lệ hai robot cùng chạy.

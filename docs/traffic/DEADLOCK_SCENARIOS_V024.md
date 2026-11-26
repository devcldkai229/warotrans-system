# Kịch bản deadlock trên MAP-ONE-V024 (hai robot)

Ngày 2026-11-25. Dựa trên:
- lab cùng ngày (U1–U3, hai robot thật);
- hình học V024: phòng phía tây, các zone khoá, lane một chiều;
- sim harness `warotrans/tools/traffic_e2e/test_flows_v024.py`: Host thật với cấu hình RealRobot, hai SimRobot.

## Sơ đồ nhanh

- **Phòng phía tây** (hai chiều, rộng khoảng 1.3 m):
  - cột trái: PARKING-A, CHARGE, PARKING-B; QUEUE (đã dời vào hốc dưới PARKING-B);
  - giữa phòng: QUALITY-INSPECTION;
  - lối ra: lên khe SHELF-A (lane A-1 / A-2), sang phải vào ZONE-CENTER, xuống dưới tới SHELF-C và BOUND-1.
- **ZONE-CENTER** (khoá, hình chữ L) là ngã tư của gần như mọi tuyến: phòng phía tây, lane B-1/B-2 sang SHELF-B, BOUND-1 (xuống) và BOUND-2 (lên).
- **ZONE-SHELF-A** và **ZONE-SHELF-B** (khoá): A-1 vào, A-2 ra; B-1 vào, B-2 ra. Lane B-2 giữa SHELF-B và CENTER chỉ dài khoảng 0.7 m.
- **Bãi dưới:** INBOUND ở đông, OUTBOUND ở tây, NO_STOP ở giữa.

## Bảng kịch bản

| # | Kịch bản | Cơ chế deadlock | Đã gặp ở | Biện pháp hiện có | Sim |
|---|---|---|---|---|---|
| Z1 | Robot đứng chờ **trong** ZONE-CENTER | Robot chỉ chạm mép zone lúc xuất phát được coi như đã ở trong zone, nên được cấp đường vào sâu rồi đứng chờ, giữ luôn zone. Robot kia cần CENTER để ra nên hai bên chờ nhau. | Lab U2 (2.5 phút), lab U3 | Chỉ được chờ trong zone khoá nếu **tâm** robot đã ở trong zone đó (9466148b) | U2 106 s, U3 87 s: đạt, không deadlock |
| Z2 | Robot chờ ở **miệng** zone khoá | Đoạn được cấp dừng sát mép zone, chắn lối ra của robot bên trong, trong khi chính nó đang chờ robot đó. | Sim (quét khoảng cách) | Đoạn cấp dừng cách miệng zone chưa giữ thêm 0.30 m (5a195392) | Unit test đạt |
| Z3 | Góc rẽ vào BOUND-1 cạnh SHELF-C | Robot đứng ở SHELF-C: phần chiếm chỗ tính cả vòng xoay, chạm khúc rẽ của robot trong CENTER. Robot ở SHELF-C lại chờ CENTER. | Sim S3 (3 phút) | Chu trình chờ chỉ đi qua robot **không thể di chuyển** (chưa được cấp đường) thì robot kia đi hẹp qua (5a195392) | S3: 239 s → 52 s, 0 deadlock |
| Z4 | Đổi chỗ hai kệ (B→C và C→B cùng lúc) | Đích của mỗi robot là chỗ robot kia đang đứng. | Dự đoán | Hàng chờ theo đích: robot đi SHELF-C chờ ở QUEUE (gần C), nhả SHELF-B | D1: đạt, 0 deadlock |
| Z5 | Ra và vào SHELF-B cùng lúc | Robot ra theo B-2 cần CENTER; robot vào theo B-1 đang ở CENTER cần SHELF-B. | Dự đoán (cùng dạng với lab U2) | Z1, Z2, và được chờ trong SHELF-B khi xuất phát ở đó | D2: đạt, 35 % thời gian hai robot cùng chạy |
| Z6 | QUALITY-INSPECTION có robot, robot khác đi ngang phòng | Robot ở QUALITY-INSPECTION chiếm giữa phòng (khe bên trái khoảng 0.38 m). | Lab U3 | Hàng chờ cho QUALITY-INSPECTION: chờ ở QUEUE; corridor box | D6: đạt |
| Z7 | Đối đầu ở lối hẹp phòng ↔ CENTER / SHELF-C | Robot có Job đi xuống, robot rảnh đi lên về đỗ: hai đường đối đầu. | Sim D3 | Bộ gỡ deadlock cho lùi ngắn, gỡ xong trong khoảng 15 s | D3: đạt, 1 lần lùi (85 s) |
| Z8 | Đối đầu ở khe SHELF-A (A-2 ra / A-1 vào) | Robot ra từ A-2 vào phòng; robot đi qua phòng lên A-1. | Dự đoán | NO_STOP ở cuối lane A-2; cấp từng đoạn | D4: đạt, 0 deadlock |
| Z9 | Bãi dưới hai chiều | OUTBOUND → BOUND-2 và BOUND-1 → INBOUND. | Dự đoán | NO_STOP giữa bãi; hàng chờ INBOUND/OUTBOUND ở QUEUE | D5: đạt, 0 deadlock |
| Z10 | Hai robot rảnh nhường nhau mãi | Robot chắn đường ra "sàn trống" giữa phòng phía tây, mà chỗ đó lại nằm trên đường về đỗ của robot kia. | Sim (sau D1) | Nếu robot chờ cũng là robot rảnh, robot chắn về **chỗ đỗ trống** (f5c58c37); robot đã đỗ thì robot kia đi hẹp qua | D1 → D2 liền nhau: đạt |
| Z11 | Chỉnh vị trí cuối ở kệ (arrival refine) | Lane một chiều khiến đường chỉnh vài cm có thể vòng qua zone khác, nên Host từ chối (`DEADLOCK_RISK`). | Lab U2 (SHELF-B) | Đỡ nhờ Z1 (không còn ai đứng trong CENTER) | **Chưa xử lý gốc**: đường chỉnh nên chỉ trong zone robot đang giữ |
| Z12 | Robot chờ nhân viên lâu (kiểm hàng, bàn giao) | Không phải deadlock, nhưng chặn lối đi của robot kia. | Lab | Hàng chờ đích; nhân viên xác nhận nhanh | — |
| Z13 | Robot tắt hoặc mất mạng giữa Job | Job ở `RECOVERY_REQUIRED`, ô và zone còn bị giữ. | Lab U3 (laptop tắt) | Phục hồi thủ công | — |

## Kết quả sim sau các bản sửa (Host thật, cấu hình RealRobot, 2 SimRobot)

| Kịch bản | Thời gian | `DEADLOCK_RISK` | Lùi | Thân xe gần nhất | Hai robot cùng chạy |
|---|---|---|---|---|---|
| S1 | 69 s | 0 | 0 | 0.73 m | 23 % |
| S3 | 52 s | 0 | 0 | 0.22 m | 18 % |
| S4 | 46 s | 0 | 0 | 0.46 m | 29 % |
| S5 | 47 s | 0 | 0 | 0.92 m | 14 % |
| M1 (6 thùng) | 84 s | 0 | 0 | 0.59 m | 16 % |
| U2 (6 thùng relocation) | 111 s | 2 | 0 | 0.40 m | 20 % |
| U3 (2× qua QUALITY-INSPECTION) | 89 s | 0 | 0 | 0.33 m | 11 % |
| D1 đổi chỗ B ↔ C | 50 s | 0 | 0 | 0.46 m | 14 % |
| D2 SHELF-B ra/vào | 44 s | 0 | 0 | 0.51 m | 35 % |
| D3 phòng tây đối đầu | 85 s | 12 | 1 | 0.27 m | 19 % |
| D4 khe SHELF-A | 46 s | 0 | 0 | 0.40 m | 23 % |
| D5 bãi hai chiều | 54 s | 0 | 0 | 0.21 m | 16 % |
| D6 2× QUALITY-INSPECTION rồi về đỗ | 81 s | 0 | 0 | 0.51 m | 26 % |

Sim chạy theo đường A* có tính lane, không chạy Nav2 thật, nên **vẫn phải kiểm trên lab**.

## Còn mở / làm tiếp

1. **Z7:** robot rảnh đang về đỗ tự nhường robot có Job khi hai đường đối đầu: chờ tại chỗ thay vì để Host gỡ bằng lùi.
2. **Z11:** chỉnh vị trí cuối (refine/docking) chỉ xin đường trong zone robot đang giữ, không xin đường vòng qua lane một chiều.
3. **Z6 (tuỳ chọn):** dời QUALITY-INSPECTION sát tường phải (x ≈ 0.57) để khe đi bên trái rộng khoảng 0.5 m. Cần bạn duyệt vì phải sửa map.
4. **Lab:** deploy costmap mới lên hai robot, chạy lại U3 → U5c.

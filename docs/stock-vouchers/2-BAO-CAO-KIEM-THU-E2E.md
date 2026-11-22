# Báo cáo kiểm thử đầu-cuối: phiếu nhập/xuất (20/11/2026)

Nhánh: `feature/voucher-confirm-complete` (tách từ `origin/develop`). Thiết kế xem tại
[1-PHIEU-XAC-NHAN-TRUOC-HOAN-THANH-THEO-ROBOT.md](1-PHIEU-XAC-NHAN-TRUOC-HOAN-THANH-THEO-ROBOT.md).

## 1. Kết luận

**Tất cả luồng đều chạy đúng theo thiết kế.** Gồm: nhập, xuất, nháp, xác nhận, hủy Job giữa chừng, Recover,
đóng phiếu thiếu, trên cả web admin và app mobile, với robot thật trong Gazebo.

- **5 lỗi được phát hiện và đã sửa** trong lúc test (mục 5).
- **Còn lại là các vấn đề dẫn đường của robot trong Gazebo/MAP-ONE-V013**, không thuộc phạm vi thay đổi này (mục 6).

## 2. Môi trường và cách test

| Thành phần | Cách chạy |
|---|---|
| Backend | `WaroTrans.Host` (Development, cổng 5090), migration `AddVoucherCompletionAndDirectIssue` đã áp dụng lên DB dev |
| Web admin | Vite dev server `localhost:5173`, điều khiển bằng Playwright + Microsoft Edge (headless): bấm nút, chọn ô, điền form như người dùng |
| App mobile | Bản Expo web `localhost:8080`, khung hình điện thoại 412×915, điều khiển bằng Playwright + Edge |
| Robot | Gazebo headless, chỉ RBT-001 (MAP-ONE-V013), Nav2 thật |
| Xác nhận của nhân viên (bốc/thả hàng) | Gọi đúng API app mobile dùng (`job-steps/{id}/claim` rồi `/confirm`) bằng script, vì camera quét mã không chạy được trong trình duyệt headless |

Theo dõi tồn kho theo từng kệ và trạng thái từng Container mỗi 2 giây trong lúc robot chạy.

## 3. Kết quả từng kịch bản

### A. Nhập kho đầy đủ (web): PN-20261120-000003, R201126003, J201126004

| Bước | Kết quả |
|---|---|
| Tạo phiếu, chọn 3 Container mới, bấm **Create and confirm** | Phiếu ra đời ở **Confirmed**, 0/3, có nút Dispatch robots (3) và Close short |
| Dispatch robots, chọn workflow INBOUND, Inbound tới SHELF-A-1 / A-2 / C-1, tạo request | R201126003 được tạo, Movement plan đúng |
| Run on robot; nhân viên xác nhận 3 lần bốc và 3 lần thả | Job COMPLETED 10/10 |
| Tồn kho | Mỗi kệ **+1 đúng lúc thả Container đó** (SHELF-C-1: 7 → 8 khi thả Container cuối) |
| Phiếu | Tự chuyển **Completed 3/3**, có thời điểm Completed |

### B. Xuất kho (web): PX-20261120-000001

| Bước | Kết quả |
|---|---|
| Tạo **nháp** với 2 Container trên kệ, **Add Containers** thêm cái thứ 3, **Confirm voucher** | Draft 0/2 → Draft 0/3 → **Confirmed** 0/3. Container vẫn `STORED`, **tồn không đổi** khi xác nhận |
| Dispatch robots, Outbound Retrieval (điểm lấy tự điền từ kệ), đích Outbound | Tạo được request. Job đầu tiên bị kẹt dẫn đường tới SHELF-A-1 (mục 6) nên đã Cancel; Container vẫn `STORED` |
| Request mới R201126005 chỉ gồm SHELF-A-2 và SHELF-C-1 (bỏ movement A-1), J201126006 | Job COMPLETED 7/7 |
| Lúc robot bốc | Container thành `IN_TRANSIT`, **tồn vẫn tính ở kệ gốc** |
| Lúc thả ở cổng Outbound | Container thành **`ISSUED` ngay**, tồn trừ ngay: SHELF-A-2 8 → 7, SHELF-C-1 8 → 7 |
| **Close short** dòng còn lại (C191126071, lý do bắt buộc) | Phiếu thành **Completed 2/3**, dòng C191126071 ghi "closed short", Container vẫn `STORED` ở SHELF-A-1 |
| Tạo phiếu xuất mới với C191126071 | Chọn được, tức Container đã được giải phóng. **Cancel voucher** nháp cũng chạy đúng |

### C. Nhập 3 kệ, thả được 2 thì Cancel Job (web): PN-20261120-000005, R201126007, J201126008

Phiếu có 4 Container. Request chỉ chở 3 (bỏ C201126019), đích theo thứ tự SHELF-A-2, SHELF-C-1, SHELF-A-1.

| Bước | Kết quả |
|---|---|
| Robot bốc 3 Container | 3 Container `IN_TRANSIT`, C201126019 vẫn `CREATED`, tồn chưa đổi |
| Thả ở SHELF-A-2, rồi SHELF-C-1 | C201126016 và C201126017 `STORED`; SHELF-A-2 10 → 11, SHELF-C-1 7 → 8 |
| Robot kẹt khi tới SHELF-A-1 (Job PAUSED) → **Cancel Job trên web** (bắt buộc lý do) | Job CANCELLED. **Hai Container đã lên kệ giữ nguyên `STORED` và giữ phần tồn đã cộng.** C201126018 thành `IN_TRANSIT`. Phiếu vẫn **Confirmed 2/4** |
| Bấm **Close short** khi C201126018 còn ghi trên robot | **Bị từ chối**: "Container 'C201126018' is still recorded on a robot. Recover it to the shelf it is on first." |
| **Recover** C201126018 vào SHELF-C-1 (màn Containers trên web) | `STORED`, SHELF-C-1 8 → 9, phiếu 3/4. Nút Dispatch robots chỉ còn đếm 1 (đúng C201126019 chưa bốc) |
| **Close short** (lý do) | Phiếu **Completed 3/4**. C201126019 ghi "closed short", vẫn `CREATED`, rời phiếu |
| Tạo request chở C201126019 khi không có phiếu | Backend từ chối `inbound_voucher_required`: phải lập phiếu nhập mới |

### D. Cancel Job khi cả 3 Container đang trên robot (web): PN-20261120-000001, J201126002

| Bước | Kết quả |
|---|---|
| Cancel Job (bắt buộc lý do) | 3 Container `IN_TRANSIT`, phiếu vẫn Confirmed 0/3 |
| Close short | Bị từ chối (`voucher_container_in_transit`) |
| Recover lần lượt 3 Container vào A-1, A-2, C-1 | Sau cái đầu: Confirmed 1/3. Sau cái cuối: **tự chuyển Completed 3/3** |

### E. App mobile (Expo web)

| Bước | Kết quả |
|---|---|
| Danh sách phiếu | Có bộ lọc Completed, badge Completed/Cancelled đúng |
| Chi tiết phiếu đã đóng thiếu (PN-20261120-000005) | Hiện Completed, ngày Completed, dòng "Closed short … : lý do", nhãn **Closed Short** ở dòng C201126019 |
| Phiếu xuất mới: chọn Container trên kệ (danh sách `STORED` kèm kệ/tầng), Review Selection, **Create And Confirm** | PX-20261120-000005 **Confirmed** ngay, "0/1 done · Stock comes off each shelf…", có nút Dispatch Robots To Ship và Close Voucher Short |
| **Close Voucher Short** (nhập lý do) khi chưa xuất gì | Phiếu **Cancelled** |
| Phiếu nhập: chọn sản phẩm, 2 thùng × 10 PCS, Review Batch, **Create And Confirm** | PN-20261120-000006 tạo 2 Container mới và **Confirmed** ngay |
| Phiếu nhập **Save As Draft**, rồi **Confirm Inbound Voucher** | PN-20261120-000007 Draft → Confirmed |
| Dispatch Robots To Put Away | Màn tạo request mở ra, Container điền sẵn, điểm lấy Inbound |
| Close Voucher Short hai phiếu nhập chưa có gì lên kệ | Cả hai **Cancelled**, Container được gỡ khỏi phiếu |

## 4. Test tự động

| Bộ test | Kết quả |
|---|---|
| Backend unit (`WaroTrans.UnitTests`) | **973 pass**, 3 skip (có sẵn) |
| Web (`vitest`) + typecheck | **231 pass**, tsc sạch |
| Mobile (`node --test`) + `tsc --noEmit` | **225 pass**, tsc sạch |
| Backend integration (`MultiGateVoucherPostgresTests` đã viết lại) | **Chưa chạy**: bộ này xóa DB test Postgres, cần bạn cho phép |

## 5. Lỗi phát hiện khi test đầu-cuối và đã sửa

1. **Nút "Dispatch robots (n)" đếm cả Container đang `IN_TRANSIT`**, trong khi những Container này không tạo request
   được. Đã sửa: web (`dispatchableLine`) và mobile (`dispatchLines`) chỉ đếm Container đang ở điểm xuất phát (nhập:
   `CREATED`/`PACKED`; xuất: `STORED`). Form tạo request từ phiếu cũng chỉ điền những Container này.
2. **Tiến độ phiếu đóng thiếu hiện "2/2"**, khiến người xem không thấy phiếu bị thiếu. Đã đổi thành "2/3" trên web và
   mobile; dòng bị đóng được ghi "closed short".
3. **Phiếu đã hủy vẫn ghi "waiting" ở từng dòng** (web). Đã đổi thành "—".
4. **App mobile thiếu package** `expo-image-picker`, `expo-print`, `qrcode` trên máy (đã khai báo trong `package.json` nhưng chưa
   cài) nên `tsc` báo lỗi. Đã chạy `npm install`; `package-lock.json` không đổi.
5. **Bản dịch tiếng Việt** cho các chữ và mã lỗi mới (`voucher_container_not_on_shelf`, `voucher_container_in_transit`,
   `voucher_not_confirmed`, `voucher_close_reason_required`, `outbound_voucher_required`, …) trên web và mobile.

## 6. Vấn đề còn lại (không thuộc phạm vi phiếu)

1. **Robot kẹt ở cửa hẹp gần (-0.25, 0.00)** khi đi tới SHELF-A-1 (và đôi lúc SHELF-A-2), Nav2 báo
   "Failed to make progress", collision monitor dừng robot. Lúc được lúc không: robot đã tới A-1 lúc 21:39 nhưng các
   lần sau thì không.
2. **Hành lang đáy dưới Parking B** (đã ghi trong `docs/traffic/3-HANH-LANG-DAY-PARKING-B-V013.md`): khi robot rảnh,
   cơ chế `FleetIdle AutoReturnToPark` cho robot về Parking A và robot kẹt ở (0.29, -1.0). Để chạy xong test,
   backend đang chạy với `FleetIdle__AutoReturnToPark=false` và Gazebo cho robot xuất hiện ở EP-INBOUND. **Backend hiện
   vẫn chạy với thiết lập này.**
3. Một lần tạo phiếu trên web mất 2.7 s và trình duyệt test đóng trước khi có kết quả (HTTP 499). Gọi lại ngay thì chỉ mất
   0.05 s; không lặp lại được. Mã phiếu PX-20261120-000002 bị bỏ qua do lần đó (sinh mã xong thì hủy giao dịch).

## 7. Dữ liệu test để lại trong DB dev

| Phiếu | Trạng thái |
|---|---|
| PN-20261120-000001 | Completed 3/3 (qua Recover) |
| PN-20261120-000003 | Completed 3/3 (robot) |
| PN-20261120-000004 | Completed 3/3 (qua Recover) |
| PN-20261120-000005 | Completed 3/4 (đóng thiếu) |
| PN-20261120-000006, PN-20261120-000007 | Cancelled (đóng thiếu từ app); Container C201126020–022 `CREATED`, không thuộc phiếu nào |
| PX-20261120-000001 | Completed 2/3 (đóng thiếu) |
| PX-20261120-000003, PX-20261120-000004, PX-20261120-000005 | Cancelled |

Phiếu nháp PN-20261120-000002 (6 Container, tạo từ trước) được giữ nguyên. Job cũ J201126002 đã được Cancel để giải phóng
RBT-001 (kịch bản D).

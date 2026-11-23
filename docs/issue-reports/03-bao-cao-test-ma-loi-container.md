# Báo cáo test: mã lỗi container và khoá thùng (22–23/11/2026)

Chạy thật trên backend nhánh `feature/report-issue` + web (Vite) + Gazebo (RBT-001, MAP-ONE-V013). Thao tác cần kiểm
(Báo sự cố, Loại container, Kiểm tra Đạt / Không đạt, Xử lý xong với kết quả) **bấm trên web** bằng Edge headless; xác
nhận lấy / giao thường gọi API (như Staff app). Dữ liệu **giữ nguyên trong DB** để đối chiếu.

## Kết quả tổng

| | Số kịch bản | Đạt |
|---|---|---|
| Trên web + robot | 10 | 10 |
| Kiểm tra từ chối (API) | 7 | 7 |
| Unit test backend | 1071 | 1071 (3 skip có sẵn) |
| Unit test web | 273 | 273 |

Integration test **chưa chạy** (xoá DB test — cần bạn cho phép).

## Dữ liệu để đối chiếu

| Lượt | Transport Request | Job | Phiếu |
|---|---|---|---|
| A — Relocation SHELF-A-1 → SHELF-C-1 | **R221126002** | **J221126002** (COMPLETED) | – |
| B — Inbound, kiểm tra chất lượng | **R221126003** | **J221126003** (COMPLETED) | PN-20261122-000001 |
| C — Outbound SHELF-C-1 → EP-OUTBOUND | **R221126004** | **J221126004** (COMPLETED) | PX-20261122-000001 |

Mở trên web: **Giám sát → Công việc → J22112600x**, hoặc **Vận hành → Sự cố → tab Container** (7 sự cố).

## Kịch bản và kết quả

| # | Kịch bản | Thao tác (web) | Kết quả | Issue |
|---|---|---|---|---|
| A1 | Sai thùng ở kệ, chặn xác nhận | Báo sự cố → Sai container (C211126003) | Bước Confirm Pickup khung đỏ, **nút Xác nhận khoá**; API confirm → 409 `handover_issue_blocking`. Xử lý bằng **quét C211126003** → xác nhận được | ISS-230E7B68 |
| A2 | Thùng hỏng ở kệ, loại khỏi chuyến | Loại container… → Vỏ container hỏng (C211126006) | FAILED trong Job; **HOLD tại SHELF-A-1**; lịch sử `HELD` | ISS-FABD91B2 |
| A3 | Hỏng phát hiện khi đang chở, không loại | Báo sự cố → Vỏ hỏng (C201126001, đang trên robot) | Vẫn IN_TRANSIT, giao tới C-1 → **HOLD tại SHELF-C-1** (không STORED) | ISS-A63B2BE2 |
| A2→ | Xử lý: Dùng tiếp | Sự cố → chọn **Dùng tiếp** | C211126006 **STORED tại A-1**, tồn kho không đổi | |
| A3→ | Xử lý: Loại bỏ | Sự cố → chọn **Loại bỏ** | C201126001 **OUT_OF_SERVICE**; tồn kho C-1 **10 → 9** | |
| B3 | Không chở an toàn ở cổng nhập | Loại container… → Không chở an toàn được (C221126003) | **HOLD tại EP-INBOUND** (từ CREATED), chưa nhập kho | ISS-8DFCC09B |
| B1 | Kiểm tra không đạt, nhiều lỗi | Không đạt… → Lệch số lượng + Bao bì (C221126001) | Loại khỏi chuyến, **HOLD tại EP-INSPECTION**; issue liệt kê 2 lỗi | ISS-40B3AF56 |
| B2 | Kiểm tra đạt | Đạt | C221126002 tới C-1 → **STORED** | – |
| B1→ | Xử lý: Sửa số lượng | Sửa số lượng = 8 | Số lượng **10 → 8**; HOLD `OFF_SHELF` tại khu kiểm tra → Recover lên A-2 → **STORED** | |
| B3→ | Xử lý: Dùng tiếp | Dùng tiếp | C221126003 về **CREATED** ở cổng nhập | |
| C1 | Thiếu thùng ở kệ | Loại container… → Thiếu container (C211126001) | **HOLD tại SHELF-C-1** | ISS-574B8C40 |
| C2 | Xuất bình thường | – | C211126002 **ISSUED** | – |
| C3 | Hỏng khi chở tới cổng xuất | Báo sự cố → Vỏ hỏng (C191126076) | Tới cổng → **HOLD tại EP-OUTBOUND, không ISSUED** | ISS-FCD03B6B |
| C1→ | Xử lý: Loại bỏ | Loại bỏ | **OUT_OF_SERVICE**; tồn kho C-1 **9 → 8** | |
| C3→ | Xử lý: Dùng tiếp | Dùng tiếp | HOLD `OFF_SHELF` tại cổng xuất (chờ đưa lên kệ) | |

Phiếu PN-20261122-000001 và PX-20261122-000001 vẫn **CONFIRMED** (chưa xong) vì còn thùng chưa vào / ra kho — đúng
thiết kế; đóng thiếu bằng chức năng "Close short" có sẵn nếu cần.

### Kiểm tra từ chối (gọi thẳng API)

| Thử | Kết quả |
|---|---|
| `fail-container` với `QUANTITY_MISMATCH` ở bước lấy hàng | 400 `container_problem_inspection_only` |
| `fail-container` với `PRODUCT_MISMATCH` ở bước lấy hàng | 400 `container_problem_inspection_only` |
| Xác nhận lấy khi có issue Sai container mở | 409 `handover_issue_blocking` |
| Đóng (Closed) issue đang khoá thùng | 409 `issue_container_outcome_required` |
| Resolved không chọn kết quả | 400 `issue_container_outcome_required` |
| Recover thùng đang khoá vì lỗi | 409 `container_held_for_issue` |
| Tạo Transport Request mới với thùng HOLD | 400 `container_not_eligible` |

## Trạng thái cuối các thùng

| Thùng | Trạng thái | Ở đâu | Ghi chú |
|---|---|---|---|
| C211126003 | STORED | SHELF-C-1 | A1 |
| C211126006 | STORED | SHELF-A-1 | A2 → Dùng tiếp |
| C201126001 | OUT_OF_SERVICE | – | A3 → Loại bỏ |
| C221126001 | STORED (8 PCS) | SHELF-A-2 | B1 → Sửa số lượng + Recover |
| C221126002 | STORED | SHELF-C-1 | B2 |
| C221126003 | CREATED | cổng nhập | B3 → Dùng tiếp |
| C211126001 | OUT_OF_SERVICE | – | C1 → Loại bỏ |
| C211126002 | ISSUED | – | C2 |
| C191126076 | HOLD (OFF_SHELF) | EP-OUTBOUND | C3 → Dùng tiếp, chờ Recover |

## Ảnh chụp (`test-20261122/`)

| Ảnh | Nội dung |
|---|---|
| `A1-report-dialog.png` | Hộp thoại Báo sự cố: chỉ mã nhìn từ ngoài, 2 mã "chặn xác nhận" |
| `A1-blocked.png` | Bước bị chặn: khung đỏ, nút Xác nhận khoá, nhãn "bị chặn" |
| `A1-resolve-form.png` | Xử lý sai thùng bằng ô quét barcode |
| `A2-fail-dialog.png` | Hộp thoại Loại container |
| `A-done-containers.png`, `B-done-containers.png`, `C-done-containers.png` | Thẻ Container của 3 Job |
| `B1-inspect-dialog.png` | Kiểm tra không đạt: chọn nhiều lỗi, có mã "bên trong" |
| `A3-resolve-form.png`, `B1-resolve-form.png` | Chọn kết quả cho thùng (Loại bỏ, Sửa số lượng) |
| `issues-container-tab.png` | Trang Sự cố, tab Container |

## Đợt 2 (23/11): kết quả xử lý theo kiện hàng

Sau phản hồi "container chỉ là thùng đóng hàng, không tái sử dụng", kết quả xử lý được đổi theo từng mã lỗi (xem tài
liệu 02, mục 4). Test trên web + API:

| # | Kịch bản | Kết quả | Issue |
|---|---|---|---|
| D1 | Hàng bên trong hư hỏng (issue của bạn), chọn **Hỏng một phần: giữ lại hàng còn tốt** = 7 | C221126003 **10 → 7 PCS**, HOLD `OFF_SHELF` tại EP-INSPECTION (chờ đưa lên kệ); issue ghi "Kiện hàng: Hỏng một phần" | ISS-41B73DB1 |
| D2 | Sai sản phẩm bên trong (báo qua API cho C211126003 trên SHELF-C-1) | Web chỉ hiện **Huỷ cả kiện** → C211126003 **OUT_OF_SERVICE**, tồn kho C-1 **8 → 7** | ISS-92856B4F |
| N8 | Chọn "Ghi nhận mất" cho Hàng hư hỏng (API) | 400 `issue_container_outcome_not_allowed` | |
| N9 | "Hỏng một phần" với 10/10 (API) | 400 `container_quantity_not_reduced` | |

Phát hiện khi test D2: báo lỗi một kiện **đang nằm yên trên kệ** chỉ gắn cờ "khoá khi giao" (vẫn STORED, vẫn chọn được
vào yêu cầu mới) → **đã sửa**: kiện không ở trên robot bị khoá ngay (unit test
`Reported_while_at_rest_on_its_shelf_it_is_held_at_once`). ISS-92856B4F được tạo trước bản sửa nên lịch sử của
C211126003 ghi `STORED->STORED … held once delivered` rồi `STORED->OUT_OF_SERVICE`.

Ảnh: `D1-partly-form.png` (3 lựa chọn của Hàng hư hỏng), `D1-partly.png` (sau xử lý), `D2-scrap-form.png` (chỉ Huỷ cả
kiện).

Unit test: backend 1086 pass, web 275 pass.

## Lỗi tìm thấy khi test (đã sửa)

1. Mô tả issue bị hai dấu chấm khi ghi chú kết thúc bằng "." → đã cắt dấu chấm thừa (từ ISS-8DFCC09B trở đi).
2. Issue MISSING của thùng **đã bị loại** vẫn báo "chặn xác nhận" → nay không chặn khi thùng đã rời Job (có unit test).
3. Trang Sự cố chưa có ô quét barcode để xử lý Sai / Thiếu container → đã thêm.

## Lưu ý môi trường test (không phải lỗi tính năng)

- Hủy **R221126001** (QUEUED từ trước, bạn đồng ý) để robot rảnh.
- Nav2 trong Gazebo kẹt nhiều lần (điểm (0.29, −1.00) trên đường về chỗ đỗ, sát SHELF-C-1, và đường Parking A → cổng xuất):
  phải restart Gazebo đặt robot tại SHELF-C-1 / EP-OUTBOUND rồi Resume; lượt B có một lần RECOVERY_REQUIRED
  (ROBOT_OFFLINE) do restart lúc đang chở → khôi phục "tiếp tục với cùng robot". Issue hệ thống **ISS-02AC1637** (JOB,
  payload recovery) sinh ra từ việc này, để nguyên.
- Lượt C: robot được giao Job khi còn đứng ở C-1 (Gazebo cũ) rồi xuất hiện lại ở Parking A; bước tới cổng xuất hoàn tất
  sau khi đặt robot tại EP-OUTBOUND.
- Backend chạy tạm `FleetIdle__AutoReturnToPark=false` cho lượt C để tránh điểm kẹt; đã bật lại `true` sau khi test.

## Quan sát giao diện (có sẵn từ trước, chưa sửa)

- Trạng thái ASSIGNED và DELIVERED của thùng trong Job đều dịch "Đã giao" → dễ nhầm.
- Nút chuyển trạng thái issue (acknowledged / in progress / resolved / closed) chưa dịch.
- Thanh tiến độ của Job đã xong không tới 100% khi có bước bị bỏ qua.

# Mã lỗi container, "Container failed" có issue, và khoá thùng (HOLD)

Tài liệu giải thích thay đổi ngày 22–23/11/2026 (nhánh `feature/report-issue`). Trước đây báo lỗi container chỉ là
một phiếu ghi chép: không tác động lên thùng, "Container failed" lúc lấy hàng không để lại issue nào, kiểm tra chất
lượng FAILED vẫn cất hàng lên kệ. Giờ **một bộ mã lỗi dùng chung**, **mọi thùng bị loại đều có issue**, và **thùng lỗi
bị khoá (HOLD) đúng chỗ nó đang đứng** cho tới khi Admin xử lý xong issue và chọn kết quả.

## 1. Ba khái niệm

| | Confirm | Report issue | Container failed |
|---|---|---|---|
| Là gì | Sự kiện của chuyến chạy: "đúng thùng, đã lấy / giao" | Hồ sơ có vòng đời riêng: "có vấn đề" | Report issue **+ loại thùng khỏi chuyến** |
| Tác động | Bước xong, thùng ONBOARD / DELIVERED | Không đổi Job; WRONG / MISSING **chặn Confirm**; lỗi hỏng → khoá thùng **khi giao** | Thùng FAILED, issue CONTAINER, thùng **khoá ngay** |
| Hiển thị | Xanh ✓ (ai, lúc nào, quét gì) | Chip cam (mở) / đỏ (chặn) / xám (xong) | Dòng đỏ "Thất bại: <lỗi>" + chip issue |

## 2. Bộ mã lỗi (`ContainerProblemCodes`, BuildingBlocks)

| Mã | Nơi thấy | Chặn Confirm | Khoá khi báo (không loại) | Mức |
|---|---|:-:|:-:|---|
| `WRONG_CONTAINER` | kệ / cổng | ✓ | – | HIGH |
| `MISSING_CONTAINER` | kệ / cổng | ✓ | – | HIGH |
| `CONTAINER_DAMAGED` | kệ / cổng | – | ✓ (khi giao) | HIGH |
| `BARCODE_UNREADABLE` | kệ / cổng | – | – (in lại nhãn) | MEDIUM |
| `UNSAFE_LOAD` | kệ / cổng | – | ✓ | HIGH |
| `OTHER` | kệ / cổng | – | – | MEDIUM |
| `PRODUCT_MISMATCH` | **chỉ khu kiểm tra** | – | ✓ | HIGH |
| `QUANTITY_MISMATCH` | **chỉ khu kiểm tra** | – | ✓ | MEDIUM |
| `CONTENTS_DAMAGED` | **chỉ khu kiểm tra** | – | ✓ | HIGH |
| `PACKAGING_DEFECT` | **chỉ khu kiểm tra** | – | ✓ | MEDIUM |

- Ở kệ / cổng Staff chỉ quét và nhìn bên ngoài: backend **từ chối** mã "bên trong" ở đó
  (`container_problem_inspection_only`). Web chỉ hiện mã phù hợp từng bước.
- Thùng **bị loại khỏi chuyến** luôn bị khoá, bất kể mã.
- `POST /api/operations/issues` (Report issue cũ của app) vẫn nhận mọi mã để app hiện tại không lỗi.

## 3. HOLD nằm ở đâu (Warehouse)

HOLD **không di chuyển thùng**. Bảng `warehouse.containers` thêm 4 cột (migration `HoldContainersForIssues`):
`hold_reason_code`, `hold_issue_id`, `held_at`, `hold_endpoint_id`.

| Phát hiện | Thùng nằm ở | Ghi nhận |
|---|---|---|
| Kệ, lúc lấy (Relocation / Outbound) | Ô kệ cũ | `current_storage_location_id` giữ nguyên, tồn kho vẫn đếm |
| Cổng nhập, lúc lấy (Inbound) | Cổng nhập | `hold_endpoint_id` = EP-INBOUND, chưa nhập kho |
| Khu kiểm tra (FAILED) | Khu kiểm tra | `hold_endpoint_id` = EP-INSPECTION |
| Đang chở, báo lỗi không loại | Nơi được giao | Kệ: HOLD trên ô mới; cổng xuất: HOLD tại cổng, **không ISSUED** |

- `current_endpoint_id` có ràng buộc `IS NULL` nên điểm đứng của thùng HOLD lưu ở cột mới `hold_endpoint_id`.
- HOLD cũ (thả ngoài kệ) được gắn lý do `OFF_SHELF` (migration cập nhật dữ liệu sẵn có).
- Mỗi lần khoá / thả là một dòng lịch sử `container_movements` loại mới `HELD` / `RELEASED`.
- Thùng HOLD: không vào Transport Request mới (`container_not_eligible`), không Recover được khi đang khoá vì lỗi
  (`container_held_for_issue`).

## 4. Xử lý xong issue → kết quả cho kiện hàng

**Container là kiện hàng (thùng đóng gói), không phải thùng dùng lại.** Kết quả xử lý nói về hàng trong kiện, và **mỗi
mã lỗi chỉ cho một số kết quả** (`ContainerProblemRule.Outcomes`; sai: 400 `issue_container_outcome_not_allowed`).
Issue đang khoá kiện **bắt buộc** chọn kết quả khi Resolved (`issue_container_outcome_required`); Closed khi chưa
Resolved bị từ chối.

| Mã lỗi | Kết quả được chọn |
|---|---|
| Hàng bên trong hư hỏng | **Hỏng một phần: giữ lại hàng còn tốt** (`ADJUST_QUANTITY`, số mới **phải nhỏ hơn** số đang có: `container_quantity_not_reduced`) · **Huỷ cả kiện** (`SCRAP`) · **Kiểm lại không sao** (`RELEASE`) |
| Lệch số lượng | **Ghi số lượng thật** (`ADJUST_QUANTITY`) · **Huỷ cả kiện** |
| Sai sản phẩm bên trong | **Huỷ cả kiện** (duy nhất) |
| Bao bì / niêm phong, Vỏ thùng hỏng | **Đóng gói lại** (`REPACK`: hàng sang thùng mới, nhãn mới, kiện giữ mã) · **Huỷ cả kiện** |
| Nhãn không đọc được | **In lại nhãn** (`RELABEL`) |
| Không chở an toàn được | **Xếp lại / đóng gói lại** (`RESTACK`) · **Huỷ cả kiện** |
| Thiếu / Sai container | **Đã tìm thấy** (`FOUND`) · **Ghi nhận mất** (`LOST`) |
| Khác | **Kiểm lại không sao** · **Ghi số lượng thật** · **Huỷ cả kiện** |

Kiện sau đó:

| Kết quả | Kiện hàng |
|---|---|
| Kiểm lại không sao, Đóng gói lại, In lại nhãn, Xếp lại, Đã tìm thấy | Trên kệ → STORED tại chỗ. Ở cổng nhập (chưa từng lên kệ) → về trạng thái trước (CREATED…). Đặt ngoài kệ → HOLD `OFF_SHELF`, người đưa lên kệ bằng Recover |
| Hỏng một phần / Ghi số lượng thật | Ghi `contents_quantity` mới (số **kiện** trong tồn kho không đổi), rồi như trên |
| Huỷ cả kiện / Ghi nhận mất | Ra khỏi tồn kho (OUT_OF_SERVICE, trừ 1 kiện ở ô nó được đếm); web hiện **Đã huỷ / Đã mất** |

Kết quả được lưu ở issue (`containerOutcome`) và trong lịch sử kiện (`RELEASED` ghi `SCRAP after PRODUCT_MISMATCH …`).
Báo lỗi một kiện **đang nằm yên** (trên kệ, ở cổng) thì kiện bị khoá **ngay**; chỉ kiện đang trên robot mới "chở tiếp,
khoá khi giao". Chưa làm: **Trả nhà cung cấp**.

Issue WRONG / MISSING chưa khoá kiện (kiện chưa bị loại) vẫn xử lý bằng **quét đúng barcode** (web có ô quét).

## 5. Luồng trong engine (WorkflowExecution)

- `fail-container` nhận `problemCode` (không gửi → `OTHER`). Mở issue CONTAINER có người báo, `JobContainer.FailureCode`
  = mã lỗi, rồi khoá thùng tại điểm của bước (`AtEndpointId`). Thùng đang trên robot → được dỡ và khoá tại điểm đó.
  Thay cho issue TRANSPORT cũ ("container-failed-onboard").
- `INSPECTION_CONFIRM` FAILED nhận `defects` (nhiều mã; không gửi → `OTHER`) và `containerId` (thùng nào; một thùng trên
  robot thì tự lấy): thùng đó bị loại, khoá tại khu kiểm tra; bước kiểm tra **chờ tiếp** các thùng còn lại, hết thùng
  thì tự đóng FAILED. Kết quả lưu ở `outputValues.inspectionFailures`.
- Kết quả xác nhận lưu thêm `scannedBarcode`; DTO bước có `confirmedByName`.
- Job lock: `FailContainerAtStepAsync` nay lấy khoá Job như Confirm.

## 6. Web

- **Job detail**: thẻ **Container** (mỗi thùng: trạng thái trong Job, xác nhận lấy / giao, chip issue, dòng đỏ "Đang
  giữ chân robot"); bước xác nhận có khung đỏ khi bị chặn và **khoá nút Xác nhận**; nút **Loại container…** và **Đạt /
  Không đạt…** (kiểm tra) mở hộp thoại mã lỗi; header có badge "N sự cố đang mở" và nút **Báo sự cố**.
- **Sự cố**: lọc theo mã lỗi container; chi tiết hiện thùng (trạng thái, chỗ đứng, số lượng, "bị khoá bởi sự cố này");
  Resolved bắt chọn kết quả (+ số lượng), ô quét barcode cho WRONG / MISSING.

## 7. Chưa làm

- Đổi ô kệ khi ô đích bị chiếm (SHELF_BLOCKED); "Đưa đi kiểm tra" tự tạo chuyến (thùng HOLD không vào TR được).
- Màn chọn mã lỗi trên app mobile (backend tương thích ngược; tài liệu API ở trên).
- Mở lại (Reopen) một issue đã thả thùng không khoá lại thùng.
- Loại bỏ thùng nhập chưa có ô kế toán (inbound chưa lên kệ) không trừ "tồn chưa phân bổ".

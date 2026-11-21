# Chọn waypoint trong workflow và cố định cổng Inbound/Outbound

Tài liệu giải thích 2 thay đổi ngày 21/11/2026:
1. Màn sửa workflow chọn được waypoint từ bản đồ, không phải dán ID.
2. Workflow INBOUND luôn lấy hàng ở cổng Inbound, OUTBOUND_RETRIEVAL luôn giao hàng ở cổng Outbound, và Transport Request bắt buộc khớp với cổng đó.

## 1. Chọn waypoint khi sửa workflow (web)

### Loại biến WAYPOINT

Ô **Type** của biến có thêm lựa chọn **WAYPOINT (điểm trên bản đồ)**. Chọn WAYPOINT thì ô "Configured value" thành ô chọn
điểm, đặt key gì cũng được (ví dụ `INSPECTION`).

- Lưu xuống: `dataType = "UUID"`, thêm `format = "WAYPOINT"`. Giá trị là **UUID của điểm**, nên runtime, binding
  vào `targetEndpointId` và mọi chỗ khác không đổi.
- `format` chỉ để màn hình biết cách hiển thị. Backend chỉ cho `format = WAYPOINT` trên biến `UUID`
  (`WorkflowDefinitionValidator`).
- Không cần migration: biến được lưu trong cột JSON `variables_schema`.
- Các biến điểm có sẵn trong DB dev (`inspectionEndpointId`, `inboundEndpointId`, `outboundEndpointId`,
  `parkEndpointId`, `chargerEndpointId`) đã được gắn `format = WAYPOINT`.

### Các chỗ có ô chọn

Ngoài biến WAYPOINT, ô chọn cũng tự hiện với giá trị `UUID` có tên kết thúc bằng `EndpointId` (`targetEndpointId`, …), ở hai chỗ:

| Chỗ | Trước | Sau |
|---|---|---|
| Biến `ADMIN_INPUT` → "Configured value" | Ô nhập chữ, dán UUID | Ô chọn: `EP-INSPECTION · Inspection · WAYPOINT` |
| Input của step, nguồn `CONSTANT` | Ô nhập chữ, dán UUID | Ô chọn như trên |
| Màn xem workflow đã Published | Hiện UUID trần | Hiện mã và tên điểm |

- Danh sách lấy từ **bản đồ đang PUBLISHED của từng kho** (nhóm theo `kho · mã bản đồ`).
- Vẫn có lựa chọn "Nhập ID…" để dán tay. ID không có trên bản đồ nào đang dùng thì được báo đỏ.
- Code: `web/src/features/workflows/EndpointValuePicker.tsx`, `endpointOptions.ts` (kèm test).

## 2. Cổng cố định của workflow

### Vì sao cần khóa cả ở Transport Request

Robot chạy tới điểm mà bước `MOVE` của workflow chỉ ra. Nhưng tồn kho và phiếu xuất được ghi theo **điểm giao trong
Transport Request** (`StockPostingProcessor`). Nếu workflow cho robot tới EP-OUTBOUND mà Transport Request ghi EP-INSPECTION,
robot thả hàng ở cổng Outbound nhưng hệ thống coi như thả ở EP-INSPECTION: Container thành `HOLD`, không trừ tồn. Vì vậy
hai bên phải luôn trùng nhau.

### Dữ liệu (DB dev, ghi đè v1)

| Workflow | Biến mới (ADMIN_INPUT) | Bước đổi |
|---|---|---|
| INBOUND | `inboundEndpointId` = EP-INBOUND | `MOVE_TO_INBOUND_AREA` (PICKUP) đi tới biến này |
| OUTBOUND_RETRIEVAL | `outboundEndpointId` = EP-OUTBOUND | `MOVE_TO_DROPOFF` (DROPOFF) đi tới biến này |

Các bước khác giữ nguyên: kệ vẫn lấy từ Transport Request; task `QUALITY_INSPECTION` vẫn đi tới `inspectionEndpointId`
khi `checkQuality = true`.

### Luật ở backend (`WorkflowFixedStops`)

Luật chung, không gắn với mã workflow:

- Nếu bước `MOVE` có `operationCode = PICKUP` đi tới một biến `ADMIN_INPUT` đã cấu hình (hoặc một `CONSTANT`), đó là
  **điểm lấy cố định**. Tương tự `DROPOFF` → **điểm giao cố định**.
- Khi tạo Transport Request (`WorkflowRequestValidator`): mọi dòng phải có điểm lấy/giao đúng điểm cố định, nếu không bị
  từ chối với `workflow_pickup_endpoint_fixed` / `workflow_dropoff_endpoint_fixed`.
- `GET /workflows/{id}/request-input-schema` trả thêm `fixedPickupEndpointId`, `fixedDropoffEndpointId`.
- Workflow nào không dùng biến/hằng cho bước MOVE (ví dụ INTERNAL_RELOCATION) thì không bị ảnh hưởng.

### Màn tạo Transport Request (web)

Khi chọn workflow có điểm cố định, ô **From** (INBOUND) hoặc **To** (OUTBOUND_RETRIEVAL) của mọi dòng được tự điền và
**khóa**, ghi "Do quy trình quy định". Áp dụng cả khi mở từ phiếu nhập/xuất (Dispatch robots).

App mobile chưa khóa ô này; nếu chọn sai điểm, backend từ chối và app hiện thông báo tiếng Việt.

## 3. Kiểm thử

- Backend unit: `WorkflowFixedStopsTests` (4 test), test `format` trong `WorkflowDefinitionValidatorTests`; toàn bộ 980 pass.
- Web: `endpointOptions.test.ts`, `fixedStops.test.ts`; toàn bộ 238 pass, tsc sạch. App: 225 pass, tsc sạch.
- Định nghĩa mới của 2 workflow được kiểm tra qua API (tạo bản tạm, publish được, rồi xóa) trước khi ghi vào v1.
- Trên web: chọn waypoint trong màn sửa workflow lưu đúng ID; màn xem hiện `EP-INSPECTION · Inspection · WAYPOINT`;
  màn tạo Transport Request INBOUND khóa From = EP-INBOUND.

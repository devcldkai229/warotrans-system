# Xem chi tiết và sửa: Sản phẩm, Danh mục, Vị trí lưu trữ, Tồn kho

Ngày: 2026-11-25. Trang: **Quản lý** (`/management`).

## 1. Tóm tắt

| Trang | Trước | Sau |
|---|---|---|
| Sản phẩm | Danh sách, thêm, bật/tắt | Bấm một dòng để **xem chi tiết**, có nút **Sửa** |
| Danh mục | Danh sách, thêm | Xem chi tiết (các sản phẩm trong nhóm), **sửa**, **xoá nhóm trống** |
| Vị trí lưu trữ | Danh sách, thêm, bật/tắt | Xem chi tiết (endpoint, tồn kho, container), **sửa tên**, **đổi endpoint** |
| Tồn kho | Chỉ xem | Bấm một dòng để xem **các container** tạo nên con số đó (vẫn chỉ xem) |

**Quyền:**
- xem cần `warehouse.read`;
- nút Sửa / Xoá chỉ hiện khi tài khoản có `warehouse.write`, và server kiểm tra lại quyền này mỗi lần lưu.

**Không sửa được:** SKU, mã danh mục, mã vị trí. Các mã này đã in trên nhãn hoặc ghi trong phiếu, nên đổi mã sẽ làm lệch giấy tờ.

## 2. Backend (module Warehouse)

| API | Việc |
|---|---|
| `PUT /api/warehouse/products/{id}` | Sửa tên, nhóm, mã vạch nhà cung cấp, mô tả |
| `PUT /api/warehouse/product-categories/{id}` | Sửa tên, mô tả |
| `DELETE /api/warehouse/product-categories/{id}` | Xoá nhóm; từ chối `product_category_in_use` khi nhóm còn sản phẩm |
| `GET /api/warehouse/storage-locations/{id}` | Chi tiết vị trí: endpoint có nằm trên bản đồ đang dùng không, số container đang ở đó, số lệnh vận chuyển đang mở, tồn kho theo sản phẩm |
| `PUT /api/warehouse/storage-locations/{id}` | Sửa tên và endpoint |
| `GET /api/warehouse/containers` | Thêm bộ lọc `productId`, `storageLocationId`, `levelNo` |

Code nằm trong `backend/src/Modules/Warehouse/Features/CatalogEditing/`.

**Quy tắc đổi endpoint của vị trí:**
- endpoint mới phải nằm trên **bản đồ đang dùng** (published), đang bật và chưa gắn với vị trí nào khác;
- **bị chặn** (`storage_location_in_transport`) khi còn lệnh vận chuyển đang mở (PENDING, QUEUED, IN_PROGRESS) đi đến hoặc đi từ vị trí hay endpoint cũ, vì robot đã được giao đi đến endpoint cũ;
- container đang nằm ở vị trí vẫn thuộc vị trí đó; từ lần vận chuyển sau, robot đến lấy ở endpoint mới;
- khi chỉ đổi tên, endpoint giữ nguyên, kể cả khi endpoint thuộc bản đồ cũ.

Đây là cách sửa bằng giao diện cho lỗi ngày 24/11: vị trí còn gắn với endpoint của map V013 nên staff không chọn được làm điểm đến. Mở vị trí, trang báo **"Phiên bản bản đồ cũ"**; bấm **Sửa** và chọn endpoint của bản đồ đang dùng.

Để Transportation trả lời được câu hỏi "có lệnh vận chuyển nào đi đến hoặc đi từ vị trí này không", interface `IContainerTransportLookup` có thêm hàm `CountActiveTransportsAtLocationAsync`.

**Ghi lịch sử:** mỗi lần sửa hoặc xoá đều ghi audit kèm giá trị trước và sau. Các action là:
- `product.updated`;
- `product_category.updated`;
- `product_category.deleted`;
- `storage_location.updated`.

Lưu mà không có gì thay đổi thì không ghi audit.

## 3. Web

Các file nằm trong `web/src/features/management/`:
- `CatalogDetail.tsx`: phần dùng chung (khối thông tin, danh sách container lọc theo sản phẩm / vị trí / tầng, nút ở cuối hộp thoại);
- `ProductDetailDialog.tsx`: thông tin, container theo trạng thái, tồn kho theo vị trí, danh sách container; nút Sửa;
- `CategoryDetailDialog.tsx`: sản phẩm trong nhóm (bấm một sản phẩm để mở chi tiết sản phẩm); Sửa; Xoá (nút mờ khi nhóm còn sản phẩm);
- `LocationDetailDialog.tsx`: cảnh báo khi endpoint thuộc bản đồ cũ; thông tin; tồn kho theo sản phẩm; container; Sửa (danh sách endpoint còn trống của bản đồ đang dùng; ô chọn bị khoá khi đang có lệnh vận chuyển);
- `InventoryRowDialog.tsx`: các container của một dòng tồn kho.

Bấm vào dòng nào trong bảng thì mở hộp thoại của dòng đó. Nút Bật/Tắt trên dòng vẫn hoạt động như trước, không mở hộp thoại.

## 4. Kiểm tra

- **Backend:** 1209 unit test qua, trong đó 13 test mới trong `CatalogEditingTests`:
  - sửa sản phẩm, giữ nguyên SKU;
  - trùng mã vạch;
  - lưu mà không thay đổi thì không ghi audit;
  - nhóm không tồn tại;
  - sửa nhóm;
  - xoá nhóm còn sản phẩm (bị chặn);
  - xoá nhóm trống;
  - đổi endpoint;
  - endpoint đã có vị trí dùng;
  - endpoint không nằm trên bản đồ đang dùng;
  - đang có lệnh vận chuyển (bị chặn);
  - đổi tên khi đang có lệnh vận chuyển (được);
  - chi tiết vị trí báo bản đồ cũ.
- **Web:** typecheck sạch, 302 test qua. Đã thêm câu tiếng Việt và mã lỗi server mới.
- **Ảnh chụp:** chi tiết sản phẩm, form sửa sản phẩm, chi tiết danh mục.
- **Chưa kiểm tra trên giao diện:** chi tiết / sửa vị trí và dòng tồn kho. Cần khởi động lại backend để có API mới; trước đó, danh sách container trong hộp thoại chưa được lọc.

# Báo cáo test: nhập kho có kiểm tra chất lượng, từ đầu tới cuối (2026-11-24)

**Môi trường:** DB dev; Gazebo 1 robot RBT-001, map MAP-ONE-V019; backend chạy cấu hình thường. Mọi thao tác nghiệp vụ dùng tài khoản **staff**, gọi cùng API mà app gọi. Trước migration, DB đã được backup vào `infrastructure/snapshots/warotrans_postgres_before_drop_contents_unit_20261124.dump`.

## 1. Test tự động

| Phần | Kết quả |
|---|---|
| Backend unit | 1192 passed, 3 skipped (7 test mới: sửa số lượng, khoá sau khi xác nhận, số lượng sai, phiếu từ chối thùng chưa có số lượng, `awaitingInbound`) |
| Backend architecture | 16 passed |
| Web (`tsc -b`, `vitest`) | Sạch, 299 passed |
| App (`tsc --noEmit`, `node --test`) | Sạch, 269 passed |

Integration test chưa chạy, vì chúng xoá DB test.

## 2. Bỏ đơn vị, sửa số lượng (API, staff)

| Bước | Kết quả |
|---|---|
| Migration `DropContainerContentsUnit` | Đã chạy; cột `contents_unit` không còn |
| Tạo thùng có gửi `unit` | 400 |
| Tạo 2 thùng không có `unit` (24/thùng) | 200; response không còn `contentsUnit` |
| `awaitingInbound` | Có 2 thùng mới; không có thùng thuộc phiếu đã xác nhận |
| Sửa C241126088 thành 20 | 200 |
| Sửa thành 0 | 400 `container_contents_invalid` |
| Tạo phiếu nhập với 2 thùng, xác nhận | PN-20261124-000003 CONFIRMED (24 và 20) |
| Sửa sau khi xác nhận | 409 `container_contents_locked` |

## 3. Luồng trọn vẹn trên Gazebo

### Job 1: J241126008, cả hai thùng đạt

| Bước (staff) | Kết quả |
|---|---|
| Tạo container C241126089, C241126090 (Hộp văn phòng phẩm, 10/thùng) | OK |
| Phiếu nhập PN-20261124-000004 với 2 thùng đó, xác nhận | CONFIRMED |
| Yêu cầu vận chuyển INBOUND R241126002, `checkQuality = true`, đích SHELF-A-1 và SHELF-C-1; staff tự xếp hàng | Job J241126008 |
| **Robot không nhận việc:** `robot_not_at_home`, robot đứng cách EP-PARKING-A 1.63 m sau Job trước. Lệnh "Về chỗ đỗ" cũng bị chặn | **Lỗi, đã sửa** (mục 2.8 tài liệu 3) |
| Lấy hàng ở cổng nhập: nhận lượt, bắt đầu, xác nhận 2 mã quét | 200 |
| Kiểm tra: C241126089 **Đạt** | Bước kiểm tra đóng luôn cho **cả hai thùng** (backend hiểu Đạt là đạt cho mọi thùng còn lại) |
| Giao lên SHELF-A-1 và SHELF-C-1 (2 trạm) | 200 |
| Kết quả | R241126002 **COMPLETED**; 2 thùng STORED |

### Job 2: J241126011, một thùng không đạt

| Bước (staff) | Kết quả |
|---|---|
| Lệnh "Về chỗ đỗ" sau khi sửa | Robot **tự chạy về** EP-PARKING-A (J241126010) |
| C241126091 và C241126092, phiếu PN-20261124-000005, yêu cầu R241126003 (`checkQuality`) | Robot nhận ngay |
| Lấy hàng | 200 |
| Kiểm tra: C241126092 **Không đạt**, mã `CONTENTS_DAMAGED` (báo trước) | 200; thùng bị loại khỏi Job |
| Kiểm tra: C241126091 **Đạt** | 200 |
| Giao C241126091 lên SHELF-A-1 | 200 |
| Kết quả | R241126003 **PARTIALLY_COMPLETED**; C241126091 STORED; C241126092 **HOLD** `CONTENTS_DAMAGED` tại khu kiểm tra; sự cố **ISS-7027515C** (CONTAINER, `CONTENTS_DAMAGED`, `removedFromJob = true`) |
| Về chỗ đỗ | Robot về EP-PARKING-A (J241126012) |

## 4. Giao diện

- Web: cột Số lượng trong bảng Containers (typecheck và test đều qua).
- App: đã mở bằng tài khoản staff trên bản web Expo (cổng 8081); ảnh 3 tab chính dùng cho báo cáo nhận xét.
- **Chưa thử trên điện thoại thật** các màn mới: chọn thùng cho phiếu nhập, ô số lượng, mã lỗi, nút Kiểm tra trên trang Chi tiết công việc.

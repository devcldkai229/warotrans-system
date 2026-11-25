# Nhận xét app mobile của Staff (2026-11-24)

**Nguồn nhận xét:**
- chạy trọn luồng nhập kho có kiểm tra chất lượng bằng tài khoản staff (Gazebo, RBT-001);
- mở app bằng bản web Expo;
- đọc code các màn: Tạo container, Phiếu kho, Yêu cầu vận chuyển, Công việc, Chi tiết công việc, Quét, Báo sự cố.

Chưa thử trên điện thoại thật.

**Mức độ:**
- **Cao:** làm sai nghiệp vụ hoặc chặn công việc.
- **TB:** gây nhầm lẫn hoặc tốn thao tác.
- **Thấp:** chưa gọn.

## 1. Đã sửa trong đợt này

| # | Màn | Vấn đề | Ảnh hưởng | Mức | Đã làm |
|---|---|---|---|---|---|
| 1 | Tạo container → Tạo phiếu nhập | Nút "Tạo phiếu nhập" mở phiếu trống. Màn phiếu nhập lại **tạo thùng mới** | Thùng vừa tạo bị bỏ rơi; sinh thùng thừa (051–054) | Cao | Phiếu nhập chỉ **chọn thùng có sẵn**; nút mang theo các thùng vừa tạo |
| 2 | Tạo container | Không có ô số lượng, thùng luôn là `1 container` và không sửa được | Số hàng trong thùng sai từ đầu | Cao | Thêm ô "Số lượng hàng mỗi thùng" (bắt buộc). Sửa được số lượng trước khi xác nhận phiếu |
| 3 | Phiếu nhập | Ô "Đơn vị tính" gõ tay cho từng thùng, không dùng vào đâu | Thêm thao tác, dữ liệu không đồng nhất ("cái", "pcs") | TB | Bỏ hẳn đơn vị (backend, web, app) |
| 4 | Chi tiết công việc | Bước **kiểm tra chất lượng** hiện là "Container to Unload (Dropoff)" và mở hộp xác nhận giao hàng | Staff đứng ở khu kiểm tra không làm được gì: backend từ chối, chỉ còn cách quét thùng ở màn Quét | Cao | Thêm "Thùng cần kiểm tra" với nút **Kiểm tra {mã}** |
| 5 | Kiểm tra chất lượng | Bấm **Đạt** cho 1 thùng thì kiểm tra đóng cho **mọi thùng còn trên robot**, không có cảnh báo | Thùng lỗi chưa kịp báo vẫn được cất lên kệ | Cao | Thêm câu hướng dẫn "Báo Không đạt trước". Đề xuất thêm ở mục 2.1 |
| 6 | Loại container / Không đạt | Không chọn được mã lỗi; backend ghi `OTHER` | Admin không biết lỗi gì; không chọn được kết quả xử lý đúng cho từng mã | Cao | Chọn mã lỗi như web: mã nhìn từ bên ngoài ở trạm giao nhận, nhiều mã khi kiểm tra |
| 7 | Báo sự cố | Cho chọn "Lệch số lượng" ở kệ / cổng (chỉ biết khi mở thùng); thiếu "Không chở an toàn được" | Lệch với web và quy tắc backend | TB | Bỏ "Lệch số lượng", thêm "Không chở an toàn được" |
| 8 | Robot sau mỗi Job | Robot kết thúc Job ở kệ. Job sau và cả lệnh **Về chỗ đỗ** đều bị chặn (`robot_not_at_home`) vì lệnh chọn bãi gần nhất, không chọn bãi nhà | Hệ thống đứng; phải dời robot bằng tay | Cao | "Về chỗ đỗ" ưu tiên **bãi nhà** của robot |
| 9 | Tạo yêu cầu INBOUND | "Deliver to" báo **No Place Found** | Staff không tạo được yêu cầu nhập | Cao | Đã dời tay 3 kệ sang map V019. **Chưa sửa code** (mục 2.1) |
| 10 | Bảng Containers (web) | Không thấy số lượng trong thùng | Phải mở từng thùng | Thấp | Thêm cột Số lượng |

## 2. Đề xuất chưa làm

### 2.1 Nghiệp vụ

| # | Màn | Vấn đề | Đề xuất | Mức |
|---|---|---|---|---|
| 11 | Xuất bản map / nhập snapshot | Kệ chỉ được dời theo nguồn gốc clone. Map dựng mới hoặc nạp từ snapshot làm **mất mọi nơi giao** | Dời kệ theo **mã endpoint**; bước kiểm tra trước xuất bản cảnh báo kệ thiếu | Cao |
| 12 | Kiểm tra chất lượng | **Đạt** đóng cả bước kiểm tra cho mọi thùng | Backend ghi Đạt **từng thùng**, chỉ đóng bước khi mọi thùng đã có kết quả; app hiện danh sách thùng với ✓ / ✗ | Cao |
| 13 | Robot rảnh | `AutoReturnToPark` tắt (vì an toàn), nên sau mỗi Job phải có người bấm "Về chỗ đỗ"; staff **không có quyền** bấm | Cho Job tự kết thúc bằng chặng về bãi nhà, hoặc cho staff quyền "Về chỗ đỗ" | TB |
| 14 | Danh sách yêu cầu | R241126003 hiện **"Hoàn thành một phần"** khi Job còn đang chạy (một thùng vừa bị loại) | Chỉ hiện kết quả cuối khi Job kết thúc; lúc đang chạy hiện "Đang chạy · 1 thùng bị loại" | TB |

### 2.2 Dễ dùng

| # | Màn | Vấn đề | Đề xuất | Mức |
|---|---|---|---|---|
| 15 | Toàn app | **Trộn tiếng Anh và tiếng Việt** khi chọn VI: "Pick-up & Delivery", "Containers / Places / Review", "Same Pick-up For All", "Review", "No Place Found", toast "Container reported failed…", nhãn "Container to Load (Pickup)" | Rà toàn bộ chuỗi chưa dịch | TB |
| 16 | Báo sự cố | Mô tả lỗi tiếng Anh dùng thuật ngữ kỹ thuật ("tote", "WMS packing list", "code 128") | Viết lại mô tả ngắn, tiếng Việt, theo đúng bộ mã lỗi (như `containerProblems.ts`) | TB |
| 17 | Vận chuyển, Công việc, Trang chủ | Hiện **mã endpoint thô** ("EP-INBOUND ➔ EP-SHELF-A-1", "Đang chạy · EP-SHELF-A-1"), trong khi chỗ khác hiện tên ("Inbound ➔ Shelf A 1") | Luôn hiện tên nơi chốn | Thấp |
| 18 | Thẻ Job, thẻ yêu cầu | Tuyến chỉ hiện **đích đầu tiên** ("➔ Shelf A 1") dù Job đi 2 kệ | Hiện "➔ Shelf A 1 +1" | TB |
| 19 | Chi tiết công việc | Thẻ hành động luôn ghi "1 Container". Khi Job thiếu dữ liệu container, sản phẩm là "Unknown Product" và mã thùng là ID (code lấy `containerId` làm mã) | Lấy barcode và tên sản phẩm từ server; đếm đúng số thùng ở trạm | TB |
| 20 | Công việc | Staff vừa tạo yêu cầu nhưng "Việc của tôi (0)"; việc nằm ở "Hàng chờ đội xe"; nhãn tab bị cắt ("Hàng chờ đội x…") | Đổi tên tab ngắn hơn ("Chờ robot"); có thể hiện cả việc do mình tạo trong "Việc của tôi" | Thấp |
| 21 | Thanh tab dưới | Chỉ có icon, không có chữ | Thêm nhãn "Trang chủ / Công việc / Vận chuyển" | TB |
| 22 | Trang chủ | Nút **"Cancel Commands"** (huỷ lệnh mọi robot) nằm ngay dưới danh sách robot của staff | Đưa vào menu an toàn, hoặc chỉ hiện cho người phụ trách | TB |
| 23 | Thông báo | Staff có 37–38 thông báo chưa đọc sau một ngày thử | Rà lại đối tượng nhận thông báo; gom thông báo cùng Job | TB |
| 24 | Kiểm tra chất lượng | Trước đây chỉ vào được bằng cách **quét thùng** ở màn Quét | Đã thêm lối từ Chi tiết công việc (#4); nên hiện cả trong "Việc của tôi" | Thấp |

## 3. Đã đúng, nên giữ

- Chặn Confirm khi có sự cố Sai / Thiếu container: app giống web.
- Trạm giao nhận: nhận lượt, bắt đầu, xác nhận theo danh sách mã quét. Chống hai người xác nhận cùng lúc.
- Ô nhập trường staff theo schema workflow (`checkQuality`) trong màn tạo yêu cầu.
- Bản đồ trên trang chủ hiện robot, đích và đường đi đang chạy.

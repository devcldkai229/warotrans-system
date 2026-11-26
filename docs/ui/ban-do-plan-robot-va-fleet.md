# Bản đồ: plan của robot, trang Fleet và mũi tên lane

Ngày: 2026-11-25.

## 1. Plan của robot (đường sắp đi)

Code vẽ plan đã có sẵn từ trước, trên app (dat-rd, 21/11) và trên web. Plan lấy từ snapshot của bộ điều phối giao thông (`GET /api/fleet/traffic/snapshot`), nên cần quyền `traffic.read`.

| Nơi | Trước | Sau |
|---|---|---|
| App, tài khoản staff | Không có plan, vì staff không có `traffic.read`. Thay vào đó hiện **vết đã đi** | **Có plan, không có vết** |
| App, Admin / Technician | Có plan và vết | Không đổi |
| Web: Fleet, Chi tiết Job | Có plan | Không đổi |
| Web: Yêu cầu vận chuyển | Không có plan | **Có plan** của robot đang chạy |

**Thay đổi:**
- `RolePermissionMatrix`: Staff có thêm `traffic.read`, chỉ đọc. Staff cần **đăng nhập lại** để token mới có quyền này.
- App `MapViewport`: lớp vết đã đi (`useMapJobTrail`) không bật với staff.
- Web `TransportRequestsPage`: truyền plan (`useTrafficOverlay`) vào bản đồ khi không ở chế độ tạo yêu cầu.

## 2. Bản đồ trang Fleet giống các trang khác

- `WarehouseMap` có tuỳ chọn mới `architecture` (mặc định bật). Fleet tắt tuỳ chọn này, nên bỏ phần kiến trúc OTTO:
  - ô kệ / ô cửa vẽ ra ngoài tường;
  - khung bản đồ mở rộng;
  - nền chấm.
- **Vẫn giữ** icon endpoint / vị trí lưu trữ (khung + biểu tượng), icon robot và màu zone (zone cấm vào giữ màu cũ).
- **Robot đúng kích thước thật:**
  - vẽ theo `lengthM` × `widthM` của robot (FL-03), mặc định 0,32 × 0,26 m;
  - chỉ khi thu nhỏ rất xa mới giữ tối thiểu 12 px để robot không biến mất (trước đây tối thiểu là 22 px).
- **Lưới tấm sàn 35 cm** (tuỳ chọn `floorTileMeters`):
  - bật ở **Lớp bản đồ → Lưới sàn (35 cm)**, mặc định tắt;
  - lưới căn giữa trong ảnh map;
  - map MAP-ONE rộng 4,30 × 3,60 m, gồm sàn 4,20 × 3,50 m (12 × 10 tấm) cộng 1 pixel viền mỗi bên;
  - robot RBT-001 vừa khoảng một tấm.

## 3. Mũi tên lane không tràn ra ngoài

**Lỗi cũ** (`laneGlyphs.ts`):
- mũi tên đặt cách nhau `0,85 × bề ngang` tính từ đầu lane, và code không kiểm tra mũi tên cuối còn đủ chỗ trước cuối lane hay không;
- lane ngắn hơn mũi tên vẫn vẽ mũi tên kích thước đầy đủ.

**Cách sửa** (web và app, vì hai bên dùng cùng một file):
- mũi tên được rải **đều giữa hai đầu lane**, mỗi đầu chừa đủ nửa chiều dài mũi tên;
- mũi tên dài tối đa **60% chiều dài lane**, nên lane ngắn có một mũi tên nhỏ, vẫn nằm trọn trong lane.

**Test** (`laneGlyphs.test.ts`):
- mọi mũi tên nằm trong lane, với nhiều độ dài lane và cả lane hai chiều;
- lane rất ngắn có một mũi tên nhỏ ở giữa;
- khoảng trống ở hai đầu lane bằng nhau.

## 4. Kiểm tra

- Backend: test ma trận quyền 44/44 qua; có test mới "Staff có `traffic.read`".
- Web: typecheck sạch, 302 test qua.
- App: typecheck sạch, 269 test qua.
- Ảnh chụp:
  - trang Fleet: bỏ kiến trúc OTTO, có lưới sàn, robot đúng cỡ;
  - app staff: không còn vết đã đi.
- **Chưa kiểm chứng** plan trên app staff khi robot đang chạy. Việc này cần khởi động lại backend để có quyền mới và chạy một Job.

## 5. Đồng bộ kiểu bản đồ trên toàn web admin

**Trước:** chỉ trang Fleet dùng kiểu `otto`. Sáu trang còn lại vẫn dùng kiểu `classic`, nên mỗi trang hiện bản đồ một kiểu khác nhau. Sáu trang đó là:
- Yêu cầu vận chuyển;
- Chi tiết Job;
- Cơ sở kho;
- Lịch sử robot;
- Phát lại nhật ký;
- Lái tay robot.

**Sau:** `WarehouseMap` mặc định dùng `appearance = 'otto'` và `architecture = false`. Mọi trang dùng chung một kiểu, không trang nào phải truyền thêm tham số. Kiểu chung gồm:
- icon endpoint;
- icon robot đúng kích thước thật;
- mũi tên lane đã sửa;
- màu zone.

Kiểu `classic` vẫn còn trong code để tham khảo, nhưng không trang nào dùng nữa.

**Đã kiểm tra bằng ảnh chụp:**
- Fleet;
- Yêu cầu vận chuyển;
- Chi tiết Job;
- Lịch sử robot (tab Di chuyển);
- Lái tay robot.

**Còn khác:**
- Màn **Xem / Sửa bản đồ** ở Cơ sở kho dùng trình chỉnh sửa riêng, không dùng `WarehouseMap`. Màn này vẫn vẽ endpoint dạng chấm kèm tên, vì cần như vậy để chỉnh sửa.
- **Phát lại nhật ký** chưa chụp được, vì dịch vụ nhật ký đang trả lỗi 502. Trang này dùng cùng `WarehouseMap`, nên đã tự đổi theo.

## 6. Plan quá mờ, lẫn vào lane (sửa 25/11 chiều)

**Hiện tượng:** plan có trong snapshot và bản đồ cũng có vẽ, nhưng người dùng không nhìn thấy:
- nét plan dày `0,16 × mark`, mà map 4,3 m thì mark chỉ 0,086, nên nét chỉ khoảng 3 px;
- màu xanh dương `#2d88ff` trùng màu với lane;
- đoạn chưa được cấp quyền đi chỉ đậm 40%.

**Cách sửa:**
- **Web:** trên kiểu bản đồ `otto`, độ dày tính theo pixel màn hình: nét 4 px, thêm viền tối phía dưới. Đoạn đã được cấp quyền đi vẽ nét liền, đoạn đang chờ vẽ nét đứt. Thêm vòng tròn đánh dấu đích.
- **Bảng màu plan** (web và app): bỏ màu xanh dương, robot đầu tiên dùng màu xanh lá `#a3e635`.

**Lưu ý:** bản đồ không có plan nào khi robot không chạy. Ví dụ Job J251126006 đang `PAUSED` vì `NAVIGATION_BLOCKED`: Nav2 huỷ lệnh đi tới Shelf A 2 sau 87 giây. Khi đó snapshot không có `proposedPath`, nên đúng là không có gì để vẽ.

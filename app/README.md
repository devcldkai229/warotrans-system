# WaroTrans Mobile Staff App

App Expo dùng React Native và TypeScript cho thao tác kho, vận chuyển và bàn giao với AMR. Backend quyết định quyền, trạng thái và kết quả thực thi. Xem [quy tắc làm việc với app](AGENTS.md).

## Chạy app

Chạy từ root repo sau khi BE đã chạy và kho active có bản đồ `PUBLISHED`.

```bash
cd app
npm ci
# Nếu chưa có .env, sao chép .env.example và đặt EXPO_PUBLIC_API_URL.
npm run web
```

Mở [web preview](http://localhost:8080). `npm start` mở Expo dev server cho điện thoại. `npm run android` và `npm run ios` dùng cùng cổng nếu có môi trường tương ứng. `.env.example` trỏ API tới `http://localhost:5090`. Trên iPhone, dùng địa chỉ LAN của máy chạy BE khi cần và kiểm tra kết nối SignalR. Chỉ đưa cấu hình công khai vào `EXPO_PUBLIC_*`.

```bash
npm run typecheck
npm test
# Khi thay đổi ảnh hưởng bundle
npx expo export --platform web --output-dir /tmp/warotrans-mobile-web-check
```

`npm run lint` hiện cũng chạy TypeScript. Dùng môi trường cô lập cho các ca kiểm thử có seed, reset hoặc ghi dữ liệu demo.

## Luồng vận hành V1

### Phiếu kho và tồn kho

- V1 dùng một kho vận hành chung cho Staff. Home, Inventory và Stock Vouchers lấy kho active có bản đồ publish gần nhất. Tên kho ở header danh sách phiếu. Form tạo phiếu giữ kho lúc mở và yêu cầu quay lại danh sách nếu kho publish thay đổi.
- **Nhập** qua Transport Hub → Stock Vouchers. Nhập tổng số thùng rồi chia nhóm theo Product, số thùng của nhóm, số lượng hàng mỗi thùng và đơn vị. Có thể tạo nhanh Product từ category có sẵn nếu có quyền. Sau Review, app tạo phiếu nháp và cấp barcode thật cho cả lô. Số tham chiếu đối chiếu chứng từ bên ngoài và ghi chú đều tùy chọn.
- Lô đã gửi giữ nguyên payload và `requestId` khi kết quả chưa rõ. Mở lại phiếu để tải các dòng server đã ghi hoặc chọn **Retry Same Batch** để tiếp tục cùng lô. Nếu mất phản hồi ngay ở bước tạo nháp, kiểm tra danh sách phiếu trước khi tạo lại.
- **Confirm Inbound** tính thùng vào tổng tồn của kho ở nhóm chưa phân vị trí. Container vẫn `CREATED` với Location và Endpoint là `None`. Khi tạo `INBOUND_PUTAWAY`, Staff chọn cổng Inbound hợp lệ và kệ đích. Tồn theo kệ được ghi khi lần giao đến kệ đã được Warehouse áp dụng, giữ nguyên tổng tồn kho.
- **Tập kết xuất** bằng TR Outbound. Chọn Product, số thùng và cổng Outbound. Review các Container BE chọn theo FIFO trước khi gửi TR. Khi hàng đã đến cổng và có trạng thái `STAGED_OUTBOUND`, Staff chọn hoặc quét các Container cụ thể để tạo phiếu xuất. Một phiếu có thể gom Container từ nhiều TR của cùng kho.
- **Confirm Outbound** kiểm tra lại toàn bộ Container đã chọn và trừ tồn một lần. BE chuyển Container sang `ISSUED` và xóa vị trí, endpoint hiện tại. Nháp và tập kết ở Outbound giữ nguyên tổng tồn.
- Mỗi Container gắn một Product. `InventoryStock.ContainerCount` đếm số thùng theo vị trí tồn. Số lượng hàng trong từng thùng được lưu riêng với đơn vị của lô.

Xem [contract phiếu kho và batch barcode](../docs/api/container-batch-receiving.md) và [contract chọn hàng FIFO cho TR Outbound](../docs/api/outbound-pick.md).

### Transport Request, Job và bàn giao

- App dựng form từ `STAFF_INPUT` của workflow đã publish. Tạo TR, Queue để sinh Job, Start để BE gán robot và Claim lượt bàn giao là các thao tác riêng. Khi Queue lỗi, dùng **Retry Queue** trên TR đã tạo.
- Một lượt bàn giao gồm các Container cần xử lý tại một điểm dừng. Sau 10 giây kể từ khi robot xác nhận đã bắt đầu MOVE đến điểm đó, BE mở quyền nhận lượt thật. Staff cùng work-zone được ưu tiên theo cấu hình, sau đó mọi Staff trong kho có thể nhận. Lượt chỉ có một người giữ.
- Bắt đầu bàn giao khi robot sẵn sàng. Hạn bắt đầu tính từ thời điểm muộn hơn giữa Claim và robot sẵn sàng. Trước Begin, lượt có thể được nhả hoặc hết hạn. Sau Begin, lượt vẫn thuộc người đang thao tác khi quá giờ hoặc mất kết nối. App đọc deadline và thao tác được phép từ BE.
- Staff quét đủ các Container trong manifest rồi chọn **Confirm All**. Nút robot xác nhận cả lượt khi được BE cho phép, với dữ liệu đúng Job, lượt và version. App giữ xác nhận từng step cho workflow không có lượt gộp.
- Chi tiết TR hiển thị pickup và delivery đang chờ, đang retry hay đã ghi nhận trong Warehouse theo `details[].warehouseSync`. Job có thể hoàn thành trong khi Warehouse vẫn đang áp dụng kết quả bàn giao.

Xem [contract Transport Request và Job Runtime](../docs/transport-request-job-runtime-integration.md) và [cấu hình thời gian Development](../backend/src/WaroTrans.Host/appsettings.Development.json).

### Pause, Issue và cứu hộ

- Staff trong kho có thể Pause Job với lý do. Người đã Pause hoặc Admin có thể Resume theo `availableActions`. Theo dõi `stop-state` để biết kết quả dừng thực tế của robot.
- Staff chọn gửi Issue hoặc gửi và Pause. Nếu đã tạo Issue mà Pause chưa thành công, app giữ mã Issue để đối soát. Sai hoặc thiếu Container chặn xác nhận trên app và nút robot. Staff có thể xử lý lỗi bàn giao do mình báo sau khi xác minh đúng barcode. Technician và Admin xử lý lỗi kỹ thuật theo quyền.
- Báo hazard trên vị trí thật của bản đồ publish, kèm mức độ, mô tả và ảnh tùy chọn. Cảnh báo đến Staff trong kho và Admin/Technician có phạm vi phụ trách. Ảnh Issue có thể gửi lại riêng nếu upload lỗi. Quyết định chặn hoặc mở đường thuộc quyền traffic.
- Payload Recovery chuyển toàn bộ hàng đang trên robot lỗi sang một robot đích đủ chỗ. Staff nhận case, chọn robot đích và quét đủ manifest. Xác nhận chuyển hàng trên app hoặc chuẩn bị lượt cho nút robot cứu hộ nếu server cho phép. Custody đổi trên cùng Job, còn quyền tiếp tục lấy theo trạng thái TR và Job hiện tại.

### Thông báo, bản đồ và điều khiển

- Inbox lưu trên server theo tài khoản, hiển thị tối đa 100 tin gần nhất và dùng tổng chưa đọc từ BE. SignalR báo app đang mở tải lại dữ liệu. Reconnect và foreground tải bù từ REST. Khi mở tin, app kiểm tra tham chiếu và quyền hiện tại. Thông báo hệ điều hành khi app ở nền nằm ngoài V1.
- Home và Job Live dùng bản đồ theo phiên bản, calibration và pose thực. Follow yêu cầu pose còn mới và đúng map. Polling bản đồ tạm dừng ở nền, tải lại khi quay về. Map tương tác bật mặc định trên iOS, Android và web. Đặt `EXPO_PUBLIC_INTERACTIVE_MAP=false` để dùng fallback. [MapViewport](src/shared/maps/MapViewport.tsx)
- Màn Manual Drive dùng quyền Technician, robot scope và manual lease để gửi lệnh theo thứ tự. Joystick chỉ phát lệnh khi giữ tay và ngắt khi nhả, rời màn hình, ra nền hoặc mất lease/kết nối. Trạng thái bật hiện tại nằm trong phần nghiệm thu bên dưới.

## Tài liệu theo công việc

| Phần | Nguồn |
|---|---|
| Kiến trúc, nghiệp vụ và workflow | [Project Rules](../rules/README.md) · [Workflow Catalog](../rules/12-WORKFLOW-CATALOG.md) |
| Entry, shell và điều hướng | [App.tsx](App.tsx) · [Shell](src/app/shell/) · [AppNavigator](src/app/navigation/AppNavigator.tsx). Navigator nội bộ với ba tab Home, Jobs và Transport. |
| Giao diện và dịch thuật | [UI primitives](src/shared/ui/) · [Theme](src/shared/theme/) · [i18n](src/shared/i18n/) |
| API và realtime | [API client](src/shared/api/) · [Capabilities](src/shared/api/capabilities.ts) · [Wire types](src/shared/types/contracts.ts) · [Realtime](src/shared/realtime/) |
| Bản đồ vận hành | [Renderer hiện tại](src/shared/maps/) · [Kế hoạch Map UI ngày 27/10/2026](MAP-UI-IMPLEMENTATION-PLAN.md) |
| Robot và gateway | [MQTT Robot Contracts](../docs/mqtt-robot-contracts.md) |
| Kiểm thử logic app | [Tests](tests/) |

## Nghiệm thu còn mở

Joystick và xác nhận bằng nút robot đang tắt mặc định. `mobileCapabilities.manualDriveTeleop` chờ xác minh quyền điều khiển manual và đường mux/watchdog trong Semantic Mode. `HumanTasks:EnableHandoverStopButton` và `Recovery:EnableTransferButton` chờ gateway hỗ trợ xác nhận đúng lượt hoặc recovery case. Xem [contract nút robot](../docs/mqtt-robot-contracts.md#grouped-handover-and-recovery-confirmations).

- [ ] **iPhone 12 và kết nối.** Ghi phiên bản iOS/Expo. Kiểm tra LAN, SignalR, camera quét barcode, chụp/chọn ảnh Issue, đổi tài khoản, hết phiên, mất mạng và foreground. Dùng đúng tài khoản Staff, Technician và Admin cho từng luồng.
- [ ] **Kho từ nhập đến xuất.** Cấp tem thật, mất phản hồi rồi retry cùng batch, Confirm Inbound, Putaway qua cổng chọn trên map, FIFO Outbound, tập kết và Confirm Outbound. Đối soát tổng tồn, vị trí/kệ và trạng thái sau từng mốc. Thử trường hợp Warehouse đang retry sau bàn giao. Tem demo phải khớp với mã server đã cấp.
- [ ] **Bàn giao và ngoại lệ.** Dùng hai tài khoản Staff để kiểm tra mở lượt MOVE +10 giây, ưu tiên zone, claim đồng thời, nhả lượt trước Begin, giữ lượt sau Begin và mở tin cũ. Thử Confirm All, Issue chặn xác nhận, Issue + Pause, quyền Resume, hazard và recovery đủ manifest. Kiểm tra TR bị hủy giữa lúc đang chuyển hàng.
- [ ] **Bản đồ native.** Trên iPhone 12, thử pan/pinch/Fit/Follow, đổi bản đồ, pose cũ và asset hết hạn. Đo FPS và độ ổn định liên tục ít nhất 10 phút với số robot dự kiến demo. Mục tiêu gesture là 60 FPS.
- [ ] **Robot thật.** Ghi kết quả riêng cho `RBT-001` và `RBT-002` cùng cấu hình sức chở. Khi gateway sẵn sàng, kiểm thử bấm nút theo lượt/version và case đang chờ, thao tác lặp hoặc đến muộn, dừng an toàn, deadman và ngắt joystick khi khóa màn hình/ra nền/mất kết nối. Dùng kết quả trên thiết bị thật để đóng các mục này.

# WaroTrans Mobile Staff App

React Native + TypeScript, Expo. Mobile hỗ trợ nhân viên thao tác hàng hóa và bàn giao với AMR; Web quản trị cấu hình; BE quyết định quyền, validation và thực thi; ROS2/Nav2 điều khiển robot qua MQTT. Role này chỉ sửa `app/` — xem [AGENTS](AGENTS.md).

## Nghiệp vụ Staff đã chốt

Nguồn: xác nhận của chủ dự án ngày 20/10 và conversation Antigravity `e40fc587-be8a-41a4-b411-2139192d1ffe` ngày 21/10/2026, gồm các phản hồi chấp thuận phương án. Đây là **yêu cầu đích**, không phải chứng nhận code đã hoàn thành. Không lấy claim “100% hoàn tất” hoặc tên API/status do AI đề xuất làm contract.

Mục tiêu: hoàn thiện workflow chính, demo với **2 robot thật và trên môi trường ảo**. Danh sách workflow nghiệm thu cuối cùng phụ thuộc BE/team. Hai robot không có nghĩa mỗi robot chỉ chở 2 container; sức chứa vật lý chưa chốt.

| Phần | Quy tắc vận hành mong muốn |
|---|---|
| Chọn nơi làm việc | Staff tự chọn kho/điểm làm việc, nhận nhiệm vụ handover từ hàng đợi chung. |
| Nhận việc kiểu Grab | Sau MOVE khoảng 10s phát thông báo; phương án đã nhận là ưu tiên Staff cùng work-zone 15s rồi mở rộng toàn kho. Ai claim trước giữ nhiệm vụ độc quyền 90s, có thể nhường; BE xử lý tranh chấp và thu hồi claim. |
| Đăng xuất/mất mạng | Logout hoặc mất kết nối quá 60s khi đang giữ task thì BE auto-release và đưa lại queue; không chỉ xóa state local. |
| Nhập hàng mới | Staff có thể tạo nhanh Product chưa có trong catalog, rồi đăng ký Container. Mỗi lần nhập dán tem WaroTrans mới trực tiếp lên kiện/carton gốc, không bắt đóng lại vào tote; xuất nguyên kiện, không lấy thu hồi vỏ rỗng làm luồng bắt buộc. |
| Bulk Transport Request | Một TR chứa nhiều container; BE chia nhiều Job/chuyến theo sức chở, điều phối robot rảnh và tổng hợp tiến độ từ Detail. Ví dụ capacity 2, 10 container → 5 Job là minh họa yêu cầu, không phải planner hiện đã làm. |
| Đích và nhiều điểm dừng | Có thể gom cùng khu hoặc chọn đích riêng từng kiện. Robot lần lượt ghé điểm 1 trả kiện 1, điểm 2 trả kiện 2; Outbound gom nhiều điểm nguồn rồi đưa ra cửa xuất. |
| Handover ít thao tác | Quét mã kiện, không bắt quét thêm mã kệ. Cùng điểm dừng có nhiều kiện thì quét liên thanh và Confirm All; BE vẫn kiểm đúng kiện, điểm dừng, người nhận và trạng thái. |
| Vị trí lưu hàng | Quy ước một ô đích chứa tối đa một kiện. BE cần chốt ánh xạ ô với StorageLocation/LevelNo và reservation; không suy ô trống chỉ từ một dòng InventoryStock của một Product. |
| Sự cố từng phần | Kiện lỗi được giữ lại để xử lý, tiếp tục giao kiện còn lại khi BE xác nhận đủ điều kiện; không tự hoàn tất bước lỗi ở mobile. |
| Vắng mặt/giao lại | Chờ handover 300s, có gia hạn 60s; hết hạn cảnh báo, về điểm chờ an toàn và cho Staff yêu cầu giao lại. Timer và lệnh robot thuộc BE, không phải countdown local. |
| Payload recovery | Staff chủ động yêu cầu/chọn robot cứu hộ, chuyển kiện và scan xác nhận; robot thay thế tiếp tục **cùng Job**. Admin theo dõi, không thay Staff thao tác hiện trường. |
| Hủy khi có hàng/pin yếu | Hủy có hàng phải đưa hàng về điểm gốc và xác nhận dỡ trước khi kết thúc; pin yếu ưu tiên trả hàng/điểm đệm an toàn, chỉ sạc khi xe trống theo chính sách BE/robot. Không dùng cancel navigate thay toàn bộ luồng này. |

Các thời gian trên là tham số đã thảo luận, chưa chứng minh engine hỗ trợ. Tên trạng thái như DELIVERY_MISSED/ABORTING_RETURN_TO_ORIGIN hoặc URL claim/batch/retry trong artifact cần BE chốt; không tự thêm vào enum/contract của hệ thống.

## Mô hình và luồng hiện tại

- Robot chở **Container**, mỗi Container gắn một Product type; InventoryStock.ContainerCount đếm container theo Product + StorageLocation + LevelNo, không đếm sản phẩm bên trong. Không lấy mô tả Multi-SKU cũ trong overview làm thay đổi mô hình V1.
- StorageLocation là vị trí lưu hàng logic liên kết Endpoint qua UUID. Endpoint/Edge/Zone là đích/đường/vùng điều hướng, geometry theo world meters; work-zone Staff không tự đồng nghĩa Navigation Zone. Không thêm entity Aisle/Bay/Bin để khớp nhãn UI.
- Workflow/Task/Step là định nghĩa có version; Job/JobTask/JobStep là instance thực thi. TransportRequestDetail lưu movement plan, JobContainer nối Request/Job/Container.
- Luồng BE đang có: tạo TR SUBMITTED → Queue mới provision Job → Start gán robot → CHECK/MOVE/HUMAN confirm → JobContainer và RequestDetail/Request đổi tiến độ. Claim human task khác Start Job; Job ASSIGNED không chứng minh Staff đã nhận task.
- Catalog chính: INBOUND_PUTAWAY, OUTBOUND_RETRIEVAL, INTERNAL_RELOCATION, POINT_TO_POINT_TRANSPORT, PAYLOAD_RECOVERY, REPLENISHMENT, MAINTENANCE_ALL_ROBOTS. Catalog không bảo đảm từng workflow/version chạy trọn vẹn.

Nguồn domain/kiến trúc: [rules](../rules/README.md), đặc biệt [domain](../rules/02-DOMAIN-RULES.md), [workflow](../rules/03-WORKFLOW-RUNTIME-RULES.md), [navigation](../rules/05-NAVIGATION-RULES.md), [catalog](../rules/12-WORKFLOW-CATALOG.md). Phần implementation status trong tài liệu cũ cần đối chiếu source.

## Hiện trạng và việc cần BE — đối chiếu 21/10/2026

| Phần | Code hiện có / khoảng trống |
|---|---|
| Auth và dữ liệu | REST login/me/refresh/logout; command lỗi không còn chuyển thành seed success. Refresh bị từ chối xác thực khác lỗi mạng/5xx; không xem mọi lỗi là revoked. |
| Kho và task queue | Picker hiện lưu nhãn local, nhiều màn lấy kho active đầu tiên. Chưa có selected warehouse context thống nhất, BE claim/owner/release/broadcast timer; không giả My Tasks bằng local state. |
| Product/receiving | CreateProduct BE hiện AdminOnly; Staff quick-create cần đổi quyền/contract do BE owner. POST containers và resolve/inventory-context có source nhưng chưa được WarehouseModule map; mobile khóa command thiếu. |
| Bulk/capacity | Planner hiện gom toàn TR thành **một batch**, chưa chia theo capacity. Cần BE planner/dispatch thật cho nhiều Job/nhiều robot; mobile không tự tạo số Job dự đoán thành kết quả thật. |
| Handover/inventory | Có confirm một JobStep với containerId/note, actor từ auth; chưa có batch-confirm/claim contract. Chưa tìm thấy Warehouse consumer cập nhật Container location/InventoryStock sau handover; Job COMPLETED chưa chứng minh tồn kho đồng bộ. |
| Workflow/ngoại lệ | Engine có MOVE, HUMAN và một số CHECK; WAIT, LOAD_STATE/INVENTORY_AVAILABLE chưa thực thi đầy đủ. Batch Confirm All, retry/no-show, partial failure, recovery/resume và hủy có hàng cần contract/orchestration BE; không thêm state giả. |
| Realtime/map | Producer xác nhận robotConnectivityChanged, robotTelemetryUpdated, jobUpdated; jobUpdated yêu cầu refetch. Map dùng geometry/calibration/pose BE; không coi Edge là live Nav2 path. Chưa có notification inbox/issue feed đầy đủ. |
| Các gap mobile khác | Repeat có rủi ro schema effect reset inputs; type DTO/projection chưa đồng nhất; paging/zone/slot thiếu metadata; cargo bay còn projection hai ô, chưa đại diện capacity robot; camera/Back/deep link cần test native. Offline sync/print chưa triển khai. |

Đối chiếu [capability guards](src/shared/api/capabilities.ts), [Warehouse mapping](../backend/src/Modules/Warehouse/WarehouseModule.cs), [Product permission](../backend/src/Modules/Warehouse/Features/CreateProduct/Endpoint.cs), [planner](../backend/src/Modules/WorkflowExecution/Planning/CollectThenDeliverJobBatchPlanner.cs), [engine](../backend/src/Modules/WorkflowExecution/Execution/JobExecutionEngine.cs). Một số quyền API chưa đầy đủ: UI ẩn nút hoặc chọn kho không thay RBAC phía BE.

Thiếu hụt trên do mobile/BE/robot phối hợp. Chưa xác nhận API/version/nghiệp vụ thì giữ unavailable rõ ràng; không mở capability để che thiếu hỗ trợ. Sức chứa từng robot, mapping điểm làm việc/tầng, quyền điều khiển và hợp đồng ngoại lệ cần team chốt trước khi triển khai.

## Source cần đọc theo task

| Vị trí | Trách nhiệm |
|---|---|
| [App.tsx](App.tsx), [index.ts](index.ts) | Entry và providers |
| [NavigationContext](src/app/navigation/NavigationContext.tsx), [AppNavigator](src/app/navigation/AppNavigator.tsx) | Navigator custom, 3 tab Home/Jobs/Transport; Live Map là màn con, không dùng Expo Router |
| `src/features/` | Auth, Home, Jobs/Verify, Inventory/Receiving, Transport, Monitoring, Safety |
| `src/shared/api/`, `src/shared/realtime/` | REST/SignalR; đối chiếu registered route và DTO BE trước khi sửa |
| `src/shared/types/contracts.ts` | Còn wire types và projection legacy; không mặc định mirror C# 1:1 |
| `src/shared/ui/`, `src/shared/components/`, `src/shared/theme/` | Primitive mới/legacy và token; giữ UI khi sửa logic |
| `tests/` | Hồi quy module logic; không thay integration/native/robot tests |

## Chạy và kiểm tra

Từ root repo, với BE/môi trường đã được chuẩn bị:

```bash
cd app
npm ci
# Nếu chưa có .env: sao chép .env.example và đặt EXPO_PUBLIC_API_URL
npm run web
```

Preview ở [localhost:8080](http://localhost:8080); `npm start`, `npm run android`, `npm run ios` dùng cùng cổng. iOS cần môi trường phù hợp. `.env.example` mặc định API localhost:5090; điện thoại có localhost riêng. API client native có rewrite loopback theo Metro host khi lấy được; cấu hình URL LAN truy cập được nếu cần, không sửa BE/CORS từ role mobile. Không đặt secret vào EXPO_PUBLIC_*.

```bash
npm run typecheck
npm test
# Khi thay đổi ảnh hưởng bundle:
npx expo export --platform web --output-dir /tmp/warotrans-mobile-web-check
```

`npm run lint` hiện cũng là tsc, chưa có linter riêng. Báo kết quả đã chạy và phạm vi: web/typecheck/unit pass không chứng minh camera, robot thật hoặc mọi workflow E2E pass. Không chạy BE integration test/seed/demo vào DB dùng chung để kiểm tra mobile.

Chỉ duy trì README và AGENTS; cập nhật ngắn phần thực sự thay đổi. Không thêm log phiên, snapshot, báo cáo audit hoặc bản sao conversation/artifact vào app.

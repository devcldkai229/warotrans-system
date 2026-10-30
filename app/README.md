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
- Job Detail hiển thị timeline theo từng JobTask instance; bấm task mở bottom sheet có thể kéo mở rộng để xem JobStep, trạng thái và lỗi. Sheet lấy task mới nhất từ dữ liệu Job, không gộp các task chỉ vì cùng điểm dừng hoặc tự đổi trạng thái thực thi.
- Fleet Queue và receipt sau Queue dẫn tới Request/Job Detail; Start Job gửi robotId=null để BE tự chọn robot enabled, online, AVAILABLE cùng map và kiểm tra robot bận. Staff không chọn robot thủ công; UI chỉ hiển thị assignment BE trả về. Queue chưa tự Start và không đồng nghĩa claim handover. Queue/Recent Dispatches phân biệt loading/error/empty, giữ dữ liệu cũ khi refresh lỗi. Link `jobs-my` mở đúng My Tasks.
- Job Activity lấy snapshot/live update của Job, dùng timestamp Created/Started/Finished thật; đánh dấu đọc chỉ giữ trong phiên app, chưa phải inbox Staff bền vững. Connection Status kiểm tra GET profile và trạng thái hub riêng; chưa lưu/replay thao tác offline. Recovery/Hazard chỉ đọc dữ liệu thực, không giả rescue readiness hoặc corridor từ cặp endpoint. Khi Job Completed nhưng Task còn mở, app báo chênh lệch của server và không tự đổi Task thành Completed.
- Job Detail gom các lần refresh do poll/SignalR khi GET còn chạy, tránh bỏ mọi response khi mạng chậm hơn chu kỳ polling. Đổi Job hoặc command thành công vô hiệu hóa response cũ; Verify hủy callback khi đóng/đổi step và chặn submit trùng. Dispatch bắt đầu với dữ liệu rỗng tới khi context kho hiện tại tải xong, khóa create/queue trong lúc gửi và chỉ áp dụng queue response đúng request.
- Transport History và Recent Dispatches mở Transport Request Detail theo request UUID. Trang này hiển thị từng movement/container, tiến độ từ trạng thái Detail và danh sách Job lọc theo request; chọn Job mới mở Job Detail. API Job hiện giới hạn 200 bản ghi/lần, chưa có phân trang; UI báo rõ nếu tổng vượt số Job trả về.
- Home, Inventory và tạo Transport Request mới tự dùng kho gắn với map PUBLISHED mới nhất theo publishedAt (createdAt/versionNo để phân định); không hiện chọn kho, không ưu tiên Job cũ hoặc kho đầu tiên. Resolver lấy active-map do BE quyết định cho từng kho active rồi chọn bản publish gần nhất, dùng chung query operating-context trên Home/Inventory và kiểm tra lại mỗi 30 giây. Job Live vẫn giữ mapVersionId của Job để không gán lại pose hoặc lộ trình của Job cũ lên bản đồ mới. Repeat giữ warehouse của request gốc, lấy bản PUBLISHED mới nhất trong kho đó.
- Home và Job Live dùng cùng `MapViewport` tương tác. Home lấy map active qua operating-context; Job Live giữ `Job.mapVersionId`, nên robot/Job thuộc map cũ không bị vẽ lên map active mới. Mã map luôn lấy từ API. Renderer xoay toàn bộ geometry/pose khi hợp với màn dọc, giữ calibration, có pan/pinch/double-tap/fit/zoom, grid mét, scale bar, Layers, scan gốc, danh sách endpoint đầy đủ và marker có hit target 48pt. Zone/endpoint/edge luôn lấy từ detail API; edge là cấu hình đường đi, không phải quỹ đạo Nav2 đang thực thi. Mô hình occupancy/kệ chỉ dùng khi ContentHash (SHA256(PGM+YAML)), frame và calibration khớp ROS; map chưa có model dùng ảnh publish kèm geometry và nút retry khi ảnh lỗi. Pull ROS không tự publish map lên BE.
- `useMapFleet` dùng chung cho Home/Job Live: SignalR `robotTelemetryUpdated` và `robotConnectivityChanged` yêu cầu tải lại snapshot robot ngay, tối đa một request đồng thời và một lượt bắt đầu mỗi 250ms; luôn giữ lượt cuối nếu event đến khi GET đang chạy. Polling mỗi 5 giây bù sự kiện bị lỡ/mất hub. Reconnect hoặc foreground tải lại ngay; background/unmount gỡ listener và timer. Cả pose và `currentMapVersionId` lấy từ cùng response REST, không ghép event pose với map ID cũ. Event hiện có `lastTelemetryAt` nhưng thiếu map/frame/session/sequence; chưa nội suy hay ngoại suy. Map hiện Live Updates/Polling/Paused/Unavailable; lỗi tải giữ last reported và khóa Follow. Robot khác map (kể cả mapVersionCode báo cáo không khớp khi có giá trị) không được vẽ nhầm lên map đang xem; Layers liệt kê robot thuộc map khác để giải thích empty state.
- Follow chỉ dùng sample đúng map/frame, online, localized và mới tối đa 15 giây. Offline/mất định vị/stale giữ vị trí báo cáo cuối có nhãn; out-of-bounds bị ẩn thay vì clamp. Native renderer để opt-in qua `EXPO_PUBLIC_INTERACTIVE_MAP=true` cho tới khi có kiểm tra release trên thiết bị thật. Hiển thị là bản đồ vận hành 2D, chưa nhúng Gazebo/gzweb. Đã xác minh Staff kết nối `/hubs/notifications` và GET fleet trả 200 trên BE local; cả 3 robot đang offline khi kiểm tra nên chưa nghiệm thu chuyển động robot thật.
- Luồng BE đang có: tạo TR SUBMITTED → Queue mới provision Job → Start gán robot → CHECK/MOVE/HUMAN confirm → JobContainer và RequestDetail/Request đổi tiến độ. Claim human task khác Start Job; Job ASSIGNED không chứng minh Staff đã nhận task.
- HUMAN pickup/dropoff nhận `confirmationSource` thật từ JobStep.outputValues: STAFF_APP hoặc ROBOT_BUTTON (không phải MOBILE_APP). Timeline hiển thị nguồn, actor và thời điểm; Verify ghim step đang mở, chuyển chỉ đọc khi robot đã confirm, không tự nhảy sang bước tiếp theo. Job Detail hỗ trợ POST resume cho PAUSED/REASSIGNING; chưa có Pause. Home, Job Detail, Job Live và Transport Request Detail refetch REST mỗi 5 giây cùng jobUpdated để bù khi SignalR gián đoạn.
- Home Fleet chỉ liệt kê robot thuộc warehouse và map đang xem; số online + enabled khác số đăng ký và chưa chứng minh robot đủ điều kiện nhận Job. Khi snapshot lỗi/paused, không hiển thị số online hiện tại; thẻ ghi Last Reported. Marker Gazebo hoặc pose cũ không chứng minh readiness.
- Transport Creation dùng context kho/map PUBLISHED mới nhất, danh sách kiện gọn có tìm/quét/lọc; chọn kiện mới mở đích riêng hoặc gán đích chung bằng search sheet. Inbound dùng mã endpoint INBOUND làm gợi ý điểm nhận; vị trí Container vẫn bắt buộc lấy từ API, không gán Unlocated vào điểm này. Putaway/Relocation chỉ đề xuất StorageLocation active được map vào WAYPOINT hiện tại; bỏ các mã staging/inspection/charger/park đã nhận diện. Đây là lọc bảo thủ theo dữ liệu hiện có, chưa phải policy đích/capacity chính thức của BE. Không bịa tầng/ô trống.
- Một nút Create Request thực hiện create rồi queue. Nếu queue lỗi, giữ receipt/request UUID và Retry Queue trên chính request đó; không tạo lại. Số Job lấy từ queue response, không tính giả theo capacity 2. Repeat dùng warehouse/workflow UUID từ request gốc, chỉ khôi phục STAFF_INPUT theo schema và đích còn hợp lệ. Tìm/quét kiểm nguồn thật cùng kho/map; container thuộc active RequestDetail bị chặn theo danh sách đã tải, BE kiểm tra cuối cùng khi create.
- Inventory By SKU lấy GET inventory, cộng ContainerCount theo Product và phân trang stock rows; không suy tồn kho từ danh sách container eligible. Tab Containers có server search, eligibleOnly=false, giới hạn 500 và báo khi còn kết quả chưa tải. Bộ lọc dùng storage/endpoint thật, hỗ trợ SHELF-* và Unlocated, không đoán zone từ tên kệ. Tự dùng operating-context, không có picker kho; scan lỗi không fallback thành công từ snapshot.
- Catalog chính: INBOUND_PUTAWAY, OUTBOUND_RETRIEVAL, INTERNAL_RELOCATION, POINT_TO_POINT_TRANSPORT, PAYLOAD_RECOVERY, REPLENISHMENT, MAINTENANCE_ALL_ROBOTS. Catalog không bảo đảm từng workflow/version chạy trọn vẹn.

Nguồn domain/kiến trúc: [rules](../rules/README.md), đặc biệt [domain](../rules/02-DOMAIN-RULES.md), [workflow](../rules/03-WORKFLOW-RUNTIME-RULES.md), [navigation](../rules/05-NAVIGATION-RULES.md), [catalog](../rules/12-WORKFLOW-CATALOG.md). Phần implementation status trong tài liệu cũ cần đối chiếu source.

## Hiện trạng và việc cần BE — cập nhật app 30/10/2026

| Phần | Code hiện có / khoảng trống |
|---|---|
| Auth và dữ liệu | REST login/me/refresh/logout; command lỗi không chuyển thành seed success. Bootstrap/refresh gặp network/5xx giữ credentials; reload mở Connection Unavailable + Retry thay vì Login. Chỉ phiên bị từ chối thật mới clear auth. API client chuẩn hóa lỗi mạng, response lỗi và 5xx; mutation mất response yêu cầu kiểm trạng thái trước khi thử lại. |
| Kho và task queue | Work-zone picker vẫn lưu nhãn local; Home/Inventory/tạo TR mới tự dùng context map PUBLISHED mới nhất, không yêu cầu chọn kho. Chưa có BE claim/owner/release/broadcast timer; không giả My Tasks bằng local state. |
| Product/receiving | Receive Goods thay Pack Container: tìm/quét Product thật, số kiện, supplier barcode tùy chọn và chọn StorageLocation active cùng map qua sheet. Chỉ gửi initialStorageLocationId đang có trong DTO; chưa có metadata receiving role. POST containers và resolve/inventory-context có source nhưng chưa được WarehouseModule map, nên Registration Unavailable. CreateProduct AdminOnly; Staff quick-create chờ BE. Không vẽ barcode bars giả hoặc hứa đã in tem; partial registration giữ các mã BE đã trả về. |
| Bulk/capacity | Planner hiện gom toàn TR thành **một batch**, chưa chia theo capacity. Cần BE planner/dispatch thật cho nhiều Job/nhiều robot; mobile không tự tạo số Job dự đoán thành kết quả thật. |
| Handover/inventory | Có confirm một JobStep với containerId/note, actor từ auth; robot button dùng chung confirmation runtime và lưu actor robot riêng. Chưa có batch-confirm/claim contract. Chưa tìm thấy Warehouse consumer cập nhật Container location/InventoryStock sau handover; Job COMPLETED chưa chứng minh tồn kho đồng bộ. |
| Workflow/ngoại lệ | Engine có MOVE, HUMAN và một số CHECK; WAIT, LOAD_STATE/INVENTORY_AVAILABLE chưa thực thi đầy đủ. Batch Confirm All, retry/no-show, partial failure, recovery/resume và hủy có hàng cần contract/orchestration BE; không thêm state giả. |
| Realtime/map | Producer xác nhận robotConnectivityChanged, robotTelemetryUpdated, jobUpdated; jobUpdated yêu cầu refetch. Map dùng geometry/calibration/pose BE; không coi Edge là live Nav2 path. Notification inbox/read và traffic snapshot/diagnostics/reconcile đều AdminOnly; issue report chưa map route cho Staff. Không mở các API admin này từ mobile Staff. |
| Các gap mobile khác | Type DTO/projection còn legacy; slot/capacity vật lý thiếu metadata. Job Detail hiển thị manifest và trạng thái container thật, không tự đặt sức chở 2 ô; projection slots legacy vẫn còn cho consumer cũ. Camera/Back/deep link cần test native. Offline sync/print chưa triển khai. |

Đối chiếu [capability guards](src/shared/api/capabilities.ts), [Warehouse mapping](../backend/src/Modules/Warehouse/WarehouseModule.cs), [Product permission](../backend/src/Modules/Warehouse/Features/CreateProduct/Endpoint.cs), [planner](../backend/src/Modules/WorkflowExecution/Planning/CollectThenDeliverJobBatchPlanner.cs), [engine](../backend/src/Modules/WorkflowExecution/Execution/JobExecutionEngine.cs). Một số quyền API chưa đầy đủ: UI ẩn nút hoặc chọn kho không thay RBAC phía BE.

Thiếu hụt trên do mobile/BE/robot phối hợp. Chưa xác nhận API/version/nghiệp vụ thì giữ unavailable rõ ràng; không mở capability để che thiếu hỗ trợ. Sức chứa từng robot, mapping điểm làm việc/tầng, quyền điều khiển và hợp đồng ngoại lệ cần team chốt trước khi triển khai.

## Source cần đọc theo task

Kế hoạch và trạng thái nâng cấp map: [Map UI Implementation Plan](MAP-UI-IMPLEMENTATION-PLAN.md). Map tương tác và cập nhật theo SignalR qua snapshot đã triển khai; nội suy trực tiếp event pose vẫn cần contract BE/robot bổ sung.

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

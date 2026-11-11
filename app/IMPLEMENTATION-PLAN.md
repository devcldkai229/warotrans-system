# Kế hoạch triển khai WaroTrans Mobile V1

Ngày lập: 10/11/2026. Owner app: Nguyễn Thành Đạt.

Đây là plan triển khai 11 task sau khi làm rõ nghiệp vụ. Các quyết định đích nằm trong [README](README.md#nghiệp-vụ-staff-đã-chốt); bảng thời gian demo cũng nằm tại đó. Plan không chứng nhận feature/API/robot đã nghiệm thu. Chưa cập nhật % Complete tại MasterPlan.

Đã đối chiếu với [checklist ownership ba thành viên ngày 08/11/2026](../../academic-docs/references/WaroTrans_Team_Domain_Checklist_Nguyen_Thang_Dat_Technician_Reassigned_2026-11-08.md). Dùng checklist để truy ownership/phụ thuộc và DoD; trạng thái audit cũ phải đối chiếu source hiện tại. Quyết định người dùng ngày 10/11/2026 ưu tiên khi nghiệp vụ khác checklist; không tự sửa checklist gốc hoặc coi các đầu việc của thành viên khác là scope code của Đạt.

## 1. Phạm vi và môi trường nghiệm thu

- App Staff và chức năng Technician được cấp quyền; joystick mobile bắt buộc có trong V1 theo quyết định mới, dù task gốc ghi P2.
- Thiết bị chính: iPhone 12 chạy app qua Expo. Tạm lấy Expo Go/quét QR làm cách chạy; ghi lại phiên bản iOS, Expo Go và cách mở app khi kiểm thử thực tế.
- Project hiện là Expo SDK 57, custom navigator; giữ cấu trúc và UI hiện có. Không chuyển sang Expo Router, đổi framework map hoặc nâng SDK trong slice này.
- Hộp thư lưu trên server và realtime khi app đang mở. Native push khi chạy nền/màn hình khóa làm sau.
- Cần evidence trên iPhone 12 và robot thật cho các luồng liên quan chuyển động/custody. Web/unit/Gazebo pass không thay physical pass.
- Mọi thay đổi thực hiện từ vai trò mobile chỉ nằm trong `app/`. Các mục BE/robot dưới đây là yêu cầu phối hợp với owner module tương ứng; chưa được coi là API hoặc schema đã tồn tại.

## 2. Ma trận 11 task

| Task | Kết quả V1 | Owner phối hợp / phụ thuộc |
|---|---|---|
| APP-CAP-02 | Pack Container có danh sách/chi tiết/tạo phiếu nhập-xuất; nhập hàng cấp mã từng thùng, điền thông tin, lưu nháp và xác nhận. Tính tồn tại Inbound khi phiếu nhập có hiệu lực; phiếu xuất lập sau tập kết và trừ tồn khi xác nhận. | Warehouse, Transportation; WH-02, WHM-02 và contract tồn kho |
| APP-CAP-03 | Chọn/tìm/quét Product thật khi điền thông tin kiện; unknown không giữ Product cũ hoặc sinh Product giả. Quick-create là thao tác chủ động có quyền riêng. | Warehouse, Identity; WH-02 |
| APP-CAP-01 | Nhận độc quyền một lượt bàn giao tại một điểm dừng; bắt đầu, nhường, hết hạn/no-show và batch confirm cả lượt trên app/nút robot. | WorkflowExecution, Identity, Robot; WH-03 |
| APP-CAP-07 | Staff Pause Job trong kho kèm lý do; Resume bởi người Pause hoặc Admin, sau readiness check. Theo dõi yêu cầu và dừng thực tế. | WorkflowExecution, Fleet; WFX-03, RB-03 |
| APP-CAP-04 | Gửi Issue hoặc gửi và Pause; có mã/tracking/evidence; lỗi sai/mất Container chặn cả hai kênh confirm. Staff xử lý lỗi nghiệp vụ của mình theo kiểm tra BE. | Operations, WorkflowExecution, Warehouse; OPS-01, WH-03 |
| APP-CAP-05 | Báo hazard với vị trí/mức độ/evidence; cảnh báo người phụ trách và Staff cùng kho; traffic review theo quyền. | Operations, Navigation, Fleet, Identity; OPS-01, FL-05 |
| APP-CAP-06 | Một robot đủ chỗ cứu toàn bộ hàng trên robot lỗi; chọn đích/quét đủ qua app, chốt cả lượt qua app/nút robot cứu hộ; tiếp tục cùng Job. | WorkflowExecution, Fleet, Warehouse, Robot; WFX-04, FL-06 |
| APP-OPS-04 | Inbox/read-unread per-user bền vững, SignalR trong foreground, tải bù, điều hướng đúng đối tượng/trạng thái hiện tại. | Operations, Identity, Host; OPS-03, SY-04 |
| APP-OPS-01 | Work-zone ưu tiên nhận việc; sau cửa sổ ưu tiên mọi Staff thuộc kho được nhận. Kho/actor/quyền do BE kiểm tra. | Identity, WorkflowExecution; WH-03, IDN-04 |
| APP-FLEET-01 | Joystick Technician trên iPhone, lease độc quyền, giữ tay để chạy, ngắt khi nhả tay/mất link/ra nền; Stop theo trạng thái thực. | Fleet, Robot; RB-04, BOTH-07, authority/mux và watchdog |
| APP-FLEET-02 | Map tương tác trên iPhone 12: map identity/pose thật, gesture, stale state, fallback và giới hạn tải khi background. | Navigation, Fleet; BOTH-01, WEB-MAP-01 |

### 2.1. Ownership và bàn giao giữa các thành viên

Owner của 11 task APP là Nguyễn Thành Đạt. Các phụ thuộc sau giữ owner theo checklist; bảng này không phân công lại công việc.

| Đầu ra cần phối hợp | Owner theo checklist | Liên quan tới plan |
|---|---|---|
| WH-02, WHM-02/03/04, WH-07, BOTH-10 | Hồ Sỹ Thắng | M1: receiving, lifecycle, phiếu, write path/contract và trạng thái đồng bộ kho. Scope phiếu nhập/xuất đầy đủ mở rộng APP-CAP-02 phải đi cùng WH-07, không chỉ bật createContainer. |
| RB-07, BOTH-08, SY-08, WEB-TR-04 | Hồ Sỹ Thắng | M2–M4: cùng Issue/lifecycle trên Web/App, lỗi có hành động xử lý tiếp, UI dùng action availability. Không yêu cầu Đạt làm lại Incident Center Web. |
| WEB-MAP-01, RB-02, BOTH-09 | Hồ Sỹ Thắng | M0/M6 và nguồn eligibility: map/read model/health dùng thật; chỉ cần phần contract phục vụ slice, không kéo toàn bộ dashboard vào scope mobile. |
| RB-03, RB-04, WFX-03, IDN-04, RB-01, BOTH-07, BOTH-04 | Nguyễn Trung Nguyên | M0/M2/M3/M5: stop, manual lease, operator pause, identity/permissions và allowed actions. RB-03/RB-04 đã chuyển sang Nguyên theo bản ownership 08/11. |
| OPS-01/02/03, SY-04/05, RTM-01/02 | Nguyễn Trung Nguyên | M2–M4: Issue, audit, recipients/inbox, hub authorization và event/projection consistency. |
| FL-01/02, FLT-01, HW-04, RB-10, RB-08 | Nguyễn Trung Nguyên | M0/M4/M5: eligibility, decision/override, nguồn battery/health và trạng thái maintenance; cần phần gate/data thực sự dùng trong demo. |
| WH-01, WH-03, WFX-04, FL-03/05/06, RB-06, BOTH-01/06, SY-06/EVT-01 | Chưa được nêu owner trong bản ba thành viên này | Các mã chỉ được cross-reference, không có task definition/owner trong file. Tra MasterPlan hoặc bản checklist đầy đủ trước khi giao việc/đóng gate; không tự gán cho Nguyên, Thắng hoặc Đạt. |

`SY-06/EVT-01` là cùng một slice độ tin cậy sự kiện, không tính thành hai feature. `WH-01/WHM-03/WHM-04/BOTH-10` là các lớp của cùng chuỗi Warehouse truth. Các mã ngoài bản checklist không được mặc nhiên coi là chưa triển khai hoặc đã sẵn sàng; cần evidence từ owner.

### 2.2. Những điểm phải đọc theo quyết định mới

| Nội dung checklist | Cách áp dụng vào plan sau trao đổi |
|---|---|
| APP-OPS-01 giới hạn nhận/xác nhận theo zone được phân quyền | Work-zone là ưu tiên; hết cửa sổ ưu tiên mọi Staff thuộc kho được nhận. Quyền theo kho/actor vẫn kiểm tra trên server. |
| APP-CAP-01 nói confirm only with lease; Staff B không confirm thay A | Kênh app kiểm tra đúng owner/lease. Nút robot vẫn được chốt cả lượt theo quyết định mới; lưu nguồn robot, không suy người nhận lượt là người bấm. Ngoại lệ này không bỏ manual-drive lease của teleop. |
| APP-CAP-02 ban đầu chỉ unlock tạo Container; WH-07 yêu cầu phiếu/stock commit có đối soát | Pack Container đã mở rộng thành phiếu nhập/xuất và cấp mã/chi tiết kiện. Tính tồn khi confirm nhập, lập phiếu xuất sau tập kết. Phiếu độc lập thao tác TR nhưng vẫn phải đối soát được theo Container/Detail/Job, hỗ trợ một phiếu gồm kiện từ nhiều TR. |
| RB-07 mô tả nhiều stage triage/verify; OPS-01 runtime hiện dùng enum khác | Giữ yêu cầu xác minh lỗi kỹ thuật/safety trước đóng. Chốt mapping action/stage với OPS-01 + RB-07, không tự thêm TRIAGED/ASSIGNED/VERIFIED vào enum app. Staff xác nhận khắc phục lỗi nghiệp vụ không có nghĩa được nhảy qua mọi stage. |
| APP-FLEET-01 ghi P2 và có điều kiện | Joystick mobile là bắt buộc V1 theo quyết định mới; readiness/authority/watchdog và physical pass vẫn là gate. |
| APP-OPS-04 ghi push/SignalR | V1 dùng inbox bền vững + realtime foreground; native push làm sau. Không miễn kiểm tra token expiry, group/scope và tải bù khi reconnect. |

Các trạng thái checklist như “route chưa map”, “inbox AdminOnly”, “chưa có permission matrix/availableActions” không còn đúng hoàn toàn với source ngày đối chiếu. M0 kiểm tra phần đã tồn tại và chỉ thực hiện delta nghiệp vụ mới; không xây lại API đã có chỉ vì ô checklist chưa cập nhật.

## 3. Các contract cần chốt trước khi bật capability

Tên field/route mới phải được owner BE chốt và có contract test. Các tên mô tả bên dưới là dữ liệu cần trao đổi, không phải DTO/API đã được triển khai.

| Chuỗi | Hiện có | Khoảng trống cần giải quyết |
|---|---|---|
| Product | `GET /api/warehouse/products/resolve`, kết quả `exactMatch/items`; Product create cần `warehouse.write`. | Quyền Staff quick-create phải hẹp theo use case, không cấp toàn bộ quyền cấu hình kho. Validation SKU/barcode trùng, Product inactive và unknown. |
| Phiếu/Container | API stock-vouchers và POST containers đã map; POST containers yêu cầu ProductId trước khi sinh mã. | Cấp mã/lưu nháp trước khi điền đủ chi tiết, số lượng/đơn vị mô tả trong kiện, số kiện theo lô, lỗi một phần và retry không cấp trùng. Chốt persistence tận dụng model hiện có trước khi đề xuất schema/migration mới. |
| Vị trí và tồn | Container lưu StorageLocation/LevelNo; stock theo Product + StorageLocation + LevelNo. | Biểu diễn đúng Inbound, kệ, đang trên robot và Outbound. Chốt dùng StorageLocation liên kết Endpoint ở staging hay contract vị trí khác; không tạo kệ/pose giả để lách model. Tổng tồn phải gồm hàng đã nhập nhưng chưa xuất, kể cả lúc đang vận chuyển. |
| Ghi nhận nhập/xuất | ConfirmStockVoucher chưa ghi tăng/giảm tồn; delivery hiện thay đổi stock. | Confirm nhập tăng một lần tại Inbound; các movement nội bộ chỉ đổi vị trí/custody. Confirm xuất chỉ nhận kiện đang ở Outbound và chưa xuất. Không bắt buộc phiếu xuất trước TR Outbound. |
| Queue nhận việc | App acceptHumanTask bị guard; chưa có claim endpoint/owner/lease thật. | Offer gắn Job/lượt dừng/manifest/map/kho; mở thật sau 10s từ MOVE thực thi; atomic claim, begin/release, deadline, version, event và snapshot để reconnect. Quyền theo kho và ưu tiên zone phải do BE quyết định. |
| Batch handover | App/robot hiện xác nhận từng JobStep. | Confirm cả lượt, validate toàn manifest và Issue chặn, lưu từng kiện, không cho engine chạy tiếp giữa batch chưa xong. Dedupe/race app–robot phải theo đúng lượt và version, không áp dụng nút bấm cũ cho lượt kế tiếp. |
| Pause/Resume | API đã có, reason còn optional; Resume chưa giới hạn người Pause. | Reason bắt buộc, actor Pause bền vững, kiểm tra kho/owner và readiness. Giữ riêng Job PAUSED với robot stop-state; robot-level Resume/manual mode không được vô tình vượt ràng buộc dừng của Job. |
| Issue/evidence | Có create/read/transition/evidence metadata; Staff chưa có quyền resolve có điều kiện. | Phân loại nghiệp vụ/kỹ thuật phía server, own-issue authorization, bằng chứng khắc phục, guard handover. Có đường upload ảnh thật trước khi lưu URI; URI file local trên iPhone không phải evidence truy cập được trên server. |
| Hazard/notifications | Issue DTO chưa có đủ map/zone/edge/pose; audience theo account/role/robot. | Lưu map version và tọa độ/tham chiếu thật, scope kho cho recipient/query/event; cảnh báo cả Staff cùng kho. Traffic restriction do người có quyền quyết định, không sửa map từ report Staff. |
| Recovery | RECOVERY_REQUIRED có enum; Resume chặn chuyển robot khi còn ONBOARD. | Claim case, robot đích đủ điều kiện, khóa assignment, scan manifest, chuyển custody có thể truy vết và tiếp tục cùng Job. App và nút robot cứu hộ chỉ chốt sau khi chọn đích/quét đủ. |
| Teleop | API lease, teleop, Stop/stop-state đã có; manual lease 30s, renew khoảng 10s. | Chốt đường điều khiển thực tế qua authority gate/mux, tuổi/thứ tự lệnh, xử lý lease cũ và mất mạng. Setpoint không được tự retry/replay sau refresh token hoặc reconnect. |
| Action/error contract | JobDetail/TR DTO đã có `availableActions: { action, allowed, reason }`; app mới có interface nhưng chưa nối vào các flow. | Tái sử dụng BOTH-04, mở rộng đúng owner/warehouse/readiness của nghiệp vụ mới. Chuẩn hóa với SY-08 phần code/origin/retryable/nextAction/incidentId/stale; không để UI tự đoán được Resume/claim/close chỉ từ status hoặc tự coi mọi lỗi đều nên retry. |
| Incident lifecycle/verification | OPS-01 hiện có OPEN, ACKNOWLEDGED, IN_PROGRESS, RESOLVED, CLOSED; RB-07 checklist có thêm các bước triage/assign/verify. | Chốt allowedTransitions/actions và evidence/verification cho lỗi kỹ thuật/safety. Đã đọc/ack, đã khắc phục, đã xác minh và đóng là các ý nghĩa riêng; không tự tạo enum hoặc cho frontend bỏ bước. |
| Đồng bộ sau handover | Engine trả Job; write-back Warehouse diễn ra qua boundary riêng. | Contract cho biết fact handover đã ghi và trạng thái kho/projection đã áp dụng hay còn pending/error. App hiện đúng hai kết quả, tải lại/reconcile; Job COMPLETED không tự chứng minh Container/Inventory đã đồng bộ. Phối hợp WH-01/WHM-03/04/BOTH-10 và SY-06/EVT-01. |

Lỗi dữ liệu phải xử lý trong slice tồn kho: `JobContainerStatusChangedHandler` hiện commit Detail rồi gọi Warehouse; lỗi Warehouse chỉ ghi log, event lặp bị bỏ qua khi Detail đã cùng trạng thái. Cần đường retry/reconcile bền vững qua contract được duyệt, có fault-injection test; không dùng một transaction xuyên DbContext hoặc tự thêm broker/Outbox mới ngoài quyết định của team.

## 4. Thứ tự triển khai

### M0 — Chốt contract và xác minh môi trường

- [ ] Chốt bảng contract ở mục 3 với owner module, response lỗi, event, idempotency và quyền; ghi OpenAPI/contract test làm bằng chứng.
- [ ] Hoàn thành bảng handoff mục 2.1: xác nhận owner của các mã chỉ được dẫn chiếu, API/event/version và evidence chấp nhận được cho từng slice. Không coi module name là người chịu trách nhiệm bàn giao.
- [ ] Đối chiếu BOTH-04/SY-08/RB-07: dùng availableActions thật, chốt error/next action và mapping resolve/verify/close; phân biệt operator pause với pause do hệ thống, fault hoặc recovery, tránh giả định mọi Job PAUSED đều có người Pause.
- [ ] Chốt ý nghĩa quantity/unit bên trong kiện và vị trí staging/transit trước schema change; không biến thành item-level transport.
- [ ] Xác minh Expo Go/runtime SDK trên iPhone 12; ghi iOS/Expo version, camera permission, LAN API URL và SignalR. Điện thoại phải truy cập được backend qua địa chỉ phù hợp, không coi localhost của máy dev là localhost của iPhone.
- [ ] Smoke test map/gesture/scan trên iPhone ngay M0; chuẩn bị account Staff A/B, Technician có robot scope và Admin theo chính sách mật khẩu/session hiện hành, không dùng Admin thay Staff để chứng minh quyền.
- [ ] Xác nhận capacity/footprint và battery/health freshness của RBT-001/RBT-002 với FL-01/FL-03/HW-04/RB-10. Battery UNKNOWN/STALE không được FE đổi thành giá trị hợp lệ; nếu demo cần override thì chỉ theo API/quyền/reason/audit đã chốt với owner, không bật bypass ngầm.
- [ ] Xác minh robot ngay ở M0 cho joystick: tài liệu MQTT/security hiện ghi teleop tắt trong Semantic Mode và chưa có physical pass. Owner Fleet/Robot phải kiểm tra cấu hình đang chạy, authority/mux/collision path và watchdog; không bật teleop bằng cách bỏ authority gate.
- [ ] Chuẩn bị môi trường BE integration với PostgreSQL/MongoDB dùng riêng. Không chạy seed/reset hoặc integration test vào DB dùng chung.

Điều kiện qua M0: contract nào chưa sẵn sàng được ghi rõ owner và phần thiếu; có thể triển khai phần app độc lập nhưng giữ capability tương ứng unavailable tới khi integration đạt.

### M1 — Warehouse: Product, phiếu và tồn kho

Task: APP-CAP-03, APP-CAP-02; phối hợp BE Warehouse/Transportation/Identity.

- [ ] Chốt/cung cấp cấp mã và phiếu nháp; barcode đã cấp được giữ để in/dán trước demo, không đoán dãy mã sắp sinh hoặc reset DB để khớp tem.
- [ ] Resolve Product qua endpoint thật; bỏ Product cũ khi scan mới/unknown, hiển thị loading/not-found/duplicate/inactive. Quick-create là form chủ động, không tự tạo từ mã lạ.
- [ ] Mở rộng Pack Container hiện có thành danh sách/chi tiết phiếu nhập-xuất và luồng tạo phiếu; giữ shell và subsection UI đang dùng.
- [ ] Nhập lô N kiện, barcode riêng từng kiện, Product/số lượng mô tả, default Inbound từ BE; khôi phục draft sau gián đoạn và giữ kết quả cấp mã đã xác nhận.
- [ ] Xác nhận phiếu nhập mới tăng tồn. Tạo TR Putaway sau đó; không cộng lại ở dropoff.
- [ ] TR Outbound chọn Product + số Container theo FIFO, đóng băng lựa chọn thực tế và chống phân bổ trùng. FIFO theo mốc nhập được BE định nghĩa, không theo lúc cấp tem trước demo.
- [ ] Phiếu xuất chọn/quét các kiện đang ở Outbound, có thể từ nhiều TR. Validate lại lúc confirm và trừ tồn đúng một lần.
- [ ] Sửa retry/reconcile Warehouse sau delivery; đảm bảo vị trí/custody và tổng tồn nhất quán qua pickup, dropoff, lỗi và retry.
- [ ] Nối BOTH-10/SY-06: handover đã ghi nhưng Warehouse chưa áp dụng phải hiện chờ đồng bộ/lỗi và có đường phục hồi bền vững. Giữ trace phiếu → Container → Detail/Job/lượt bàn giao; phiếu đa TR vẫn đối soát được.

File app chính: `src/features/inventory/CreateContainerScreen.tsx`, `receivingData.ts`, `src/shared/api/warehouseApi.ts`, `src/features/transport/TransportScreen.tsx`, `transportDraft.ts`, `dispatchSubmission.ts` và navigation liên quan. Tách component/module trong feature khi có trách nhiệm thực, không thay cả screen bằng form generic.

Gate M1: tạo/query đúng ID/barcode; phiếu nháp không tăng tồn; confirm nhập tăng, vận chuyển giữ tổng, confirm xuất giảm. Retry/confirm đồng thời không double-post; sai Product/kho/vị trí và offline có lỗi thật.

Thêm regression liên quan WH-04/TRN-01: hủy TR trước pickup không hủy lần nhập đã ghi tồn; hủy khi ONBOARD không coi hàng đã trả/đã xuất. Hàng đến Outbound nhưng chưa có phiếu xuất hiệu lực vẫn còn trong tồn; không lấy terminal của TR/Job làm lệnh trừ tồn.

### M2 — Nhận việc, work-zone và hộp thư

Task: APP-CAP-01, APP-OPS-01, APP-OPS-04; phối hợp WorkflowExecution/Identity/Operations/Host/Robot.

- [ ] Mở queue nhận lượt thật tại MOVE +10s, ưu tiên zone theo config rồi toàn kho. Không chỉ thêm notification giả hoặc derive My Tasks từ robot assignment.
- [ ] Nhận độc quyền theo Job/lượt dừng, hiện người giữ lượt và mốc thời gian BE. Hai Staff claim đồng thời chỉ một người thắng.
- [ ] Cho nhận khi robot đang MOVE; thời hạn đến bắt đầu chỉ tính từ thời điểm muộn hơn giữa claim và robot ready. Begin/quét không được hoàn tất handover trước khi robot sẵn sàng.
- [ ] Nhả/no-show trước bắt đầu; đã bắt đầu thì giữ lượt khi quá giờ/mất mạng và cảnh báo. Mọi deadline/thu hồi do server điều khiển.
- [ ] App quét đủ manifest rồi Confirm All; robot một lần bấm chốt đúng cả lượt. Issue chặn và các điều kiện custody áp dụng cho cả hai kênh.
- [ ] Nối inbox/read/read-all per-user; SignalR invalidates/tải bù REST, loại trùng và giữ dữ liệu cũ kèm lỗi khi refresh thất bại.
- [ ] Điều hướng notification theo entity/lượt thật; read không claim. Mở tin hết hạn hoặc đã có người khác nhận thì hiện trạng thái mới, không tái tạo quyền cũ.
- [ ] Tách inbox server khỏi Job Activity derive local; logout/đổi account xóa cache của account cũ, read state vẫn do server giữ.
- [ ] Nối availableActions và reason từ DTO, giữ 409 khi state/version thay đổi. Kiểm RTM-01/RTM-02: token hết hạn/revoked hoặc đổi quyền/scope phải reconnect/resubscribe theo session policy; không chỉ xử lý REST mà để hub giữ group cũ. Source hiện đã có CloseOnAuthenticationExpiration, cần tái sử dụng và kiểm chứng scope kho mới.

File app chính: `executionApi.ts`, `identityApi.ts`, `authContext.tsx`, `JobsScreen.tsx`, `JobDetailScreen.tsx`, `VerifyModal.tsx`, `handoverData.ts`, `jobData.ts`, `RealtimeContext.tsx`, `realtimeClient.ts`, `NotificationSheet.tsx`, `ZonePickerModal.tsx`. API inbox mới chỉ thêm khi đã map DTO thật.

Gate M2: MOVE +10s có thể claim ngay; expiry không tính lúc robot còn chạy; Staff khác không app-confirm thay owner; robot confirm lưu nguồn robot. App/robot race hoặc nút lặp không xác nhận lần hai/lượt kế tiếp. Đăng nhập lại giữ inbox/read, không lộ tin account/kho khác.

### M3 — Pause, Issue và hazard

Task: APP-CAP-07, APP-CAP-04, APP-CAP-05; phối hợp WorkflowExecution/Fleet/Operations/Navigation/Identity.

- [ ] Nối Pause theo Job với reason bắt buộc; Staff trong kho được Pause, người Pause hoặc Admin mới Resume sau kiểm tra. Không lấy Cancel làm Pause hay suy robot đã dừng từ HTTP 202/Job PAUSED.
- [ ] Theo dõi stop-state tới verified/rejected/unknown; giữ phản hồi chưa xác định khi mất response và refetch trước retry.
- [ ] Issue có hai lựa chọn gửi/gửi và Pause, tự gắn đúng Container/Job/Step/lượt và evidence. Tạo ticket thành công, Pause lỗi phải giữ mã ticket và chỉ retry phần còn thiếu.
- [ ] Sai/mất Container chặn xác nhận; Staff resolve own business issue bằng kiểm tra thực, không cấp toàn bộ issue.manage. Technical/traffic do Technician/Admin xử lý.
- [ ] Phối hợp RB-07/BOTH-08: cùng Issue ID, allowedTransitions, evidence và kết quả trên Web/App. Không coi acknowledge là resolved; lỗi kỹ thuật/safety chưa có verification hợp lệ không được close hoặc mở lại robot/tuyến. Mutation dùng expectedVersion theo contract; action Staff đã khắc phục không tự skip stage.
- [ ] Hazard chọn vị trí/đường thật, mức độ và mô tả; đề xuất ảnh tùy chọn để không cản báo nhanh, cho bổ sung sau. Camera/upload lỗi không giả attachment thành công.
- [ ] Gửi cảnh báo hazard cho người phụ trách và Staff cùng kho; Staff chỉ report, traffic review/chặn/mở do người có quyền. Gỡ Issue không tự sửa map, Resume hoặc thay kết quả handover.

File app chính: `IssueReportingModal.tsx`, `BlockPathHazardScreen.tsx`, `JobDetailScreen.tsx`, `SafetyActionSheet.tsx`, `SafetyHoldContext.tsx`, API execution/fleet và module Issue mới trong feature phù hợp. Nút soft hold radius 3m không được mở như một lệnh thật khi chưa có contract vị trí/phạm vi.

Gate M3: đúng actor/role/kho; Staff không đóng technical issue hoặc tự đổi nhãn để vượt quyền. Hazard có vị trí/ID/tracking thật; read/create Issue không cấp quyền sửa map. Offline/partial success và stop-state unknown hiển thị đúng.

### M4 — Payload Recovery

Task: APP-CAP-06; phối hợp WorkflowExecution/Fleet/Warehouse/Robot.

- [ ] Nhận case và khóa người xử lý/robot đích theo contract; robot cứu hộ phải đủ chỗ cho toàn bộ hàng ONBOARD trên robot lỗi, cùng context hợp lệ và đủ readiness.
- [ ] Hiện robot nguồn/đích, manifest, tiến độ cứu hộ thật. Không có robot phù hợp thì giữ case chờ xử lý.
- [ ] Chỉ chuyển khi robot/điểm chuyển sẵn sàng. App chọn đúng đích, quét đủ barcode và ghi vết từng kiện; gián đoạn giữ trạng thái chuyển để đối chiếu, không giả rollback chuyển động vật lý.
- [ ] App hoặc nút robot cứu hộ chốt cả lượt sau khi đủ điều kiện. Dedupe/race theo case/version, cập nhật custody/assignment nhất quán rồi tiếp tục cùng Job.
- [ ] Giữ completed steps, không tạo business TR/phiếu mới, không tăng/giảm tổng tồn. Robot nguồn vẫn chờ xử lý kỹ thuật; không giải phóng traffic đang chiếm chỉ vì dỡ hết hàng.
- [ ] Kiểm WH-04/TRN-01 và availableActions ngay lúc chốt/resume: nếu TR bị hủy, Job đổi policy hoặc có fault/traffic hold mới trong lúc cứu hộ thì dừng flow cũ và lấy chỉ dẫn BE. Không tự tiếp tục giao theo destination cũ chỉ vì chuyển custody đã thành công; yêu cầu trả hàng/xử lý tiếp thuộc contract của owner.

File app chính: `PayloadRecoveryScreen.tsx`, API execution/fleet và phần barcode/manifest dùng chung đã có.

Gate M4: thiếu/sai kiện, robot không đủ chỗ, hai Staff xử lý hoặc mất mạng giữa chuyển đều không cho resume sai. Case hoàn tất chứng minh mỗi kiện chỉ có một custody hiện hành; robot đích tiếp tục đúng phần Job còn lại.

### M5 — Joystick Technician trên iPhone

Task: APP-FLEET-01, bắt buộc V1; phối hợp Fleet/Robot. Chuẩn bị contract/robot ở M0 để không phát hiện blocker vào cuối đợt.

- [ ] Màn điều khiển nhận đúng permission và robot scope; Staff không có manual-drive. Hiện lease holder/deadline/reason không khả dụng từ server.
- [ ] Xin/renew/release lease bằng contract hiện có. Lease 30s, renew khoảng 10s là mốc hiện tại BE; không rút các mốc này theo profile timeout demo của handover.
- [ ] Joystick chỉ phát vận tốc khi giữ tay và có lease/context hợp lệ; nhả/cancel gesture đưa ý định về 0 ngay. Dùng Gesture Handler/Reanimated sẵn có, xử lý hướng/giới hạn tốc độ theo contract; không copy hook dùng window/document của web sang native.
- [ ] Ngắt khi AppState inactive/background, khóa màn hình, rời screen, logout, mất link, mất lease, robot đổi trạng thái hoặc scope bị thu hồi. Trở lại foreground/reconnect không tự chạy; cần thao tác điều khiển mới và lease hợp lệ.
- [ ] Vòng gửi dùng giá trị mới nhất, có giới hạn request đang chạy, không xếp hàng setpoint cũ. Teleop không dùng mutation retry/offline queue; tránh apiFetch tự refresh rồi replay vận tốc cũ. Token hết hạn làm ngắt điều khiển và chỉ cho lái lại sau xác thực/readiness.
- [ ] BE/robot chốt chống lệnh đến muộn/đảo thứ tự/lease cũ và tuổi lệnh từ ý định gốc; SentAt được BE đóng lại lúc publish không tự chứng minh lệnh HTTP cũ còn hợp lệ.
- [ ] Giữ Drive Assist và mọi authority/traffic gate. AUTO/manual không tranh điều khiển; manual release không tự Resume Job đã Pause.
- [ ] Stop riêng gửi lệnh thật và theo dõi stop-state. Teleop setpoint theo MQTT QoS0 hiện không có ACK/RESULT; không dựng ACK giả cho joystick hoặc lấy HTTP Accepted làm bằng chứng motor đã dừng.

Tài liệu hiện mô tả gửi khoảng 200ms/lần và deadman gateway 0,5s. Đây là baseline contract cần owner Robot kiểm chứng trên cấu hình/motor thật; không dùng lease hết hạn 30s làm cơ chế ngắt nhanh. [MQTT Teleop](../docs/mqtt-robot-contracts.md#teleop-backend--robot-manual-drive) và [hạn chế robot](../docs/security/03-dieu-khien-robot-an-toan.md) đang ghi Semantic Mode tắt teleop, cần giải quyết đường authority/mux trước physical pass.

File app dự kiến: feature điều khiển Technician phù hợp dưới `src/features/`, API fleet, permission/navigation và vòng teleop native có lifecycle riêng. Chỉ thêm native dependency nếu kiểm tra SDK/runtime cho thấy thư viện hiện có chưa đáp ứng.

Gate M5: hai client tranh lease, quyền Staff bị từ chối, mất Wi-Fi giữa lúc kéo joystick, ra nền/khóa máy/đóng app, reconnect, request cũ tới muộn, lease takeover và STOP đều có evidence. Motor phải dừng nhờ lớp robot khi không thể gửi được gói Stop từ iPhone. Không đánh dấu hoàn thành chỉ từ UI/web/Gazebo.

### M6 — Map iPhone và rehearsal toàn luồng

Task: APP-FLEET-02 và regression các slice.

- [ ] Kiểm tra MapViewport hiện có trên iPhone 12 với flag native opt-in; pan/pinch/double-tap/Fit/Follow, marker, safe area/dock, camera scanner và chuyển screen.
- [ ] Pose/map identity/frame/calibration/staleness từ dữ liệu thật; đổi map không vẽ robot cũ sang map mới. Ảnh/map không tải được hiện lỗi/fallback geometry thực, không dùng map demo thay thế.
- [ ] Giữ SignalR-triggered REST snapshot và polling bù hiện có; không bắt buộc nâng lên nội suy event trong V1 khi thiếu map/frame/session/sequence.
- [ ] Đo FPS/frame time, request rate và ổn định bộ nhớ trên thiết bị, chạy liên tục ít nhất 10 phút với số robot dự kiến demo. Mục tiêu gesture 60 FPS; báo số đo và giới hạn thực tế, không coi debug/Expo Go pass là release performance đã đạt.
- [ ] Kiểm POL-04 với WEB-MAP-01: asset public/private/signed URL đúng quyết định owner, iPhone và robot lấy đúng bundle/version. Token/URL hết hạn hiện lỗi và tải lại đúng quyền, không bỏ auth để chữa lỗi ảnh; PUBLISHED geometry không bị app/Staff/Technician sửa trái quyền POL-01.
- [ ] Kiểm background ngừng tải map, foreground/reconnect tải lại, stale pose không Follow; cache geometry, tránh redraw/fetch vô hạn làm hao pin/data.
- [ ] Sau khi native checks đạt mới bật interactive map cho cấu hình demo iPhone; unsupported thì dùng fallback thật và ghi giới hạn nghiệm thu.
- [ ] Rehearsal: nhập/cấp tem/confirm tồn → Putaway/claim/batch handover → Outbound FIFO/tập kết → phiếu xuất; thêm nhánh Issue+Pause, hazard, recovery và joystick với role Technician.
- [ ] Hồ sơ physical pass tách riêng RBT-001/RBT-002 và cấu hình capacity/footprint thực của từng robot. Không lấy evidence một robot/Gazebo làm bằng chứng cho cả hai hoặc gán capacity giống nhau để demo cứu hộ.

Dùng [Map UI Implementation Plan](MAP-UI-IMPLEMENTATION-PLAN.md) cho chi tiết renderer đã có; plan này bổ sung nghiệm thu thiết bị và tích hợp luồng, không làm lại map từ đầu.

## 5. Kiểm thử và evidence tối thiểu

| Nhóm | Bằng chứng cần có |
|---|---|
| App | Typecheck; test logic/contract/race/timeout phù hợp; web export khi bundle bị ảnh hưởng. Thất bại giữ input, partial success giữ receipt/ID, loading khác empty và stale khác live. |
| BE | Unit và contract/auth/integration trên DB dùng riêng: confirm/retry/race, actor/kho/zone priority, batch, stock, own-issue resolution, recovery, manual lease và message freshness. Migration nếu có phải do module owner thực hiện và chạy trên DB sạch. |
| iPhone 12 | Phiên bản iOS/Expo, camera/scan, gesture, modal error, deep link nội bộ từ inbox, account switch, mất mạng, background, khóa màn hình, foreground và không tự resume joystick. |
| Robot thật | Ảnh/log/video cùng correlation Job/lượt/case/Container/robot; stop-state, lease, watchdog/authority, batch button, chuyển custody và resume đúng Job. Tách rõ kết quả Gazebo/rig với kết quả motor thật. |
| Tồn kho | Đếm trước/sau confirm nhập, các chặng vận chuyển, recovery và confirm xuất. Fault-injection Warehouse sau Detail commit rồi retry phải tự khôi phục đúng, không mất/nhân đôi tồn. |
| Cross-module/race | TR cancel trước pickup/đang ONBOARD/giữa recovery; Issue bị reopen hoặc quyền đổi khi form còn mở; robot nút bấm tới muộn sau re-offer; Warehouse pending/error sau handover; API và hub từ chối đúng actor/site/scope. |
| Audit/đối soát | SY-05/OPS-02 truy được actor/source, reason, before/after hoặc fact liên quan, correlation và thời điểm cho stock commit, handover, claim/release, Pause/Resume, manual lease và recovery. Không chỉ có log console/client; có read/query evidence và kiểm tra không lộ credential. |
| Demo | Profile timeout đã cấu hình trên BE; mở queue tại MOVE +10s thực sự claim được; đường bình thường đi tiếp ngay khi hoàn tất, không phải chờ hết timeout. Tem in sẵn khớp mã đã cấp thật. |

Đối với thay đổi chỉ là tài liệu, kiểm tra diff và link; không chạy lại test app/BE chỉ để xác nhận plan. Baseline app đã chạy trong đợt audit là typecheck và 21 file test pass; đó không phải evidence các hành vi mới ở plan đã triển khai.

## 6. Đầu ra mỗi milestone và điều kiện đóng task

- Thực hiện theo nhóm nhỏ: thống nhất phạm vi → triển khai → kiểm tra tự động → chủ dự án kiểm chứng trực tiếp → sửa/kiểm lại đến khi được chấp thuận → commit và push → nhóm tiếp theo. Không tự commit/push hoặc chuyển nhóm khi người dùng chưa nghiệm thu.
- Nhóm triển khai đầu tiên: phần độc lập của APP-OPS-04, nối GET inbox và POST read/read-all đang có, số chưa đọc theo server, tải bù foreground/reconnect, điều hướng Job/Request đã có màn chi tiết. Còn chờ nghiệm thu trên iPhone 12; chưa đóng toàn bộ APP-OPS-04, các link Issue/Recovery/Container và audience theo kho vẫn phụ thuộc contract/màn tương ứng.
- Mỗi slice có danh sách file app đổi, contract BE/robot được dùng, kết quả kiểm thử và phần chưa có evidence.
- Capability chỉ mở sau khi route/DTO/quyền/response tương ứng được kiểm chứng. Chưa có API thì giữ unavailable rõ; không thêm thành công giả để đi tiếp demo.
- Mọi code/model mới giữ boundary module; không tự thêm entity/table/status/Step Type/broker hoặc sửa schema ngoài owner chỉ để làm DTO app khớp.
- Task có thể hoàn tất phần app trước phần BE/robot, nhưng checklist E2E chỉ đóng khi toàn slice đạt Gate. Joystick V1 không được loại khỏi scope vì task gốc ghi P2; nếu authority/watchdog chưa đạt, báo chính xác phần còn thiếu.
- Chỉ cập nhật MasterPlan % Complete khi có evidence hợp lệ; việc đã chốt nghiệp vụ hoặc đã viết plan không phải phần trăm triển khai.

## 7. Nguồn kiểm chứng chính

- Nghiệp vụ: [README](README.md), các quyết định người dùng ngày 10/11/2026.
- API kho: [WarehouseModule](../backend/src/Modules/Warehouse/WarehouseModule.cs), [CreateContainer](../backend/src/Modules/Warehouse/Features/CreateContainer/Request.cs), [ConfirmStockVoucher](../backend/src/Modules/Warehouse/Features/ConfirmStockVoucher/Handler.cs).
- Tồn/TR: [CreateTransportRequest](../backend/src/Modules/Transportation/Features/CreateTransportRequest/Handler.cs), [delivery handler](../backend/src/Modules/Transportation/IntegrationEventHandlers/JobContainerStatusChangedHandler.cs), [ContainerMovementRecorder](../backend/src/Modules/Warehouse/Services/ContainerMovementRecorder.cs).
- Runtime: [JobExecutionEngine](../backend/src/Modules/WorkflowExecution/Execution/JobExecutionEngine.cs), [robot button handler](../backend/src/Modules/WorkflowExecution/IntegrationEventHandlers/RobotInteractionConfirmedHandler.cs).
- Issue/inbox: [Issue endpoints](../backend/src/Modules/Operations/Features/IssueReports/Endpoints.cs), [Notification contracts](../backend/src/Modules/Operations/Contracts/NotificationContracts.cs).
- Điều khiển: [RobotControl endpoints](../backend/src/Modules/Fleet/Features/RobotControl/Endpoints.cs), [Teleop handler](../backend/src/Modules/Fleet/Features/TeleopRobot/Handler.cs), [web loop tham khảo](../web/src/features/robots/manual/useTeleopLoop.ts).
- Expo SDK 57: [Gesture Handler có trong Expo Go](https://docs.expo.dev/versions/v57.0.0/sdk/gesture-handler/), [Reanimated có trong Expo Go](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/). Dependencies/bundledNativeModules local đã được đối chiếu; vẫn cần chạy thực trên iPhone.
- Trạng thái code khi review checklist: [availableActions của Job](../backend/src/Modules/WorkflowExecution/Features/Shared/JobDtos.cs), [hub token expiry](../backend/src/WaroTrans.Host/Program.cs), [IssueStatus hiện có](../backend/src/Modules/Operations/Enums/IssueStatus.cs), [battery eligibility](../backend/src/Modules/Fleet/Features/Dispatch/DispatchEligibility.cs).

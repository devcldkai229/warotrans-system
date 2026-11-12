# WaroTrans — Task Ownership & Domain Checklist (Full Team)
**Ngày:** 08/11/2026 · **Định dạng:** Theo thành viên → Domain → nhóm công việc → Task

**Phạm vi:** Checklist phân công theo từng thành viên; các mã, trạng thái, mức ưu tiên, mô tả hiện trạng, công việc cần thực hiện và DoD được giữ từ Unified Done Checklist v2.1. Những task được điều chuyển theo quyết định 08/11/2026 có đúng một owner. Đây là phân công triển khai, không phải evidence đã hoàn tất.

> **MasterPlan là Source of Truth duy nhất của `% Complete`.** Checklist không tự tính % và không thay đổi tiến độ. `[ ]` chưa hoàn tất, `[~]` đang partial/mock/capability locked, `[x]` wired theo code audit. Kiểm thử phần mềm không tự động được coi là `PHYSICAL PASS`; RBT-001/RBT-002 phải có bằng chứng lab.

> **Nguyên tắc ownership:** mỗi mã task chỉ thuộc một người. Các mã trong mục **Phụ thuộc / cùng slice** là cross-reference để triển khai đúng thứ tự, không phải phân công thêm. `EVT-01` là alias/subtask của `SY-06`; không biến nó thành một feature độc lập.

---

## Nguyễn Trung Nguyên

### D01 — Identity, Authentication, Authorization & Security

#### Backend — Identity & RBAC

- [ ] **IDN-01 — Self change password / force change first login** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Login và quản lý account có sẵn; chưa thấy flow đổi mật khẩu của chính user hoặc ép đổi mật khẩu tạm.
  - **Cần triển khai:** Thêm endpoint change-password, xác thực mật khẩu cũ, chính sách password, first-login-required và huỷ token/session theo chính sách. Tách reset-token khỏi đổi mật khẩu thông thường.
  - **DoD / Acceptance:** User dùng mật khẩu tạm bị yêu cầu đổi; sai mật khẩu cũ bị từ chối; mật khẩu mới đăng nhập được, audit đầy đủ.
  - **Phụ thuộc / cùng slice:** `IDN-02, OPS-02`.

- [ ] **IDN-02 — Admin reset password** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** UpdateAccount được audit chỉ sửa email, tên, role; chưa có reset password.
  - **Cần triển khai:** Tạo thao tác reset riêng, phát mật khẩu tạm hoặc reset token có hạn; cấm trả lộ credential trên logs hoặc response dư thừa.
  - **DoD / Acceptance:** Admin hợp lệ reset được; Staff/Technician bị 403; user đổi khi đăng nhập tiếp, có audit và thông báo an toàn.
  - **Phụ thuộc / cùng slice:** `IDN-01, RB-01`.

- [ ] **IDN-03 — GET /accounts/{id}** `[P2]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Create trả header Location nhưng thiếu endpoint đọc account theo ID.
  - **Cần triển khai:** Bổ sung GET by id có kiểm tra tenant/site/quyền, DTO không lộ hash hay dữ liệu nhạy cảm, xử lý 404 nhất quán.
  - **DoD / Acceptance:** Link Location từ Create truy xuất được và trả đúng account; actor trái quyền bị 403; invalid ID trả 404.
  - **Phụ thuộc / cùng slice:** `POL-01..03`.

- [ ] **IDN-04 — Permission matrix thay cho role enum đơn giản** `[P0]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Hiện ADMIN/STAFF, AdminOnly hoặc StaffOrAdmin; chưa có permission granularity.
  - **Cần triển khai:** Thiết kế permissions theo hành động: robot.read, robot.stop, robot.manual.*, issue.*, inventory.*, TR.*, user.*. Seed TECHNICIAN và scope site/robot; triển khai policy ở server và claim/token phù hợp.
  - **DoD / Acceptance:** Thử ma trận quyền với cả access denied; override trên UI hoặc HTTP thủ công đều không vượt được kiểm soát.
  - **Phụ thuộc / cùng slice:** `RB-01, BOTH-07, POL-01..03`.

- [ ] **RB-01 — TECHNICIAN actor + permission & scope** `[P0]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Role Technician và màn hình riêng chưa được xác nhận wired.
  - **Cần triển khai:** Seed role, resource/action permissions, scope robot/site, policy deny-by-default; không đồng nhất Admin với quyền bỏ qua safety. Quyền điều khiển phải phụ thuộc lease và trạng thái robot.
  - **DoD / Acceptance:** Technician đọc/chẩn đoán/dừng/manual đúng robot được phân; STAFF không teleop; không thể cấp role hoặc sửa tồn kho nếu chưa được cấp quyền.
  - **Phụ thuộc / cùng slice:** `IDN-04, RB-03, RB-04, BOTH-07`.

#### Security policies / access boundary

- [ ] **POL-01 — Navigation mutation APIs → AdminOnly** `[P0]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** FallbackPolicy hiện cho mọi user đã xác thực; một số mutate endpoints chưa ràng role.
  - **Cần triển khai:** Audit toàn bộ Map/Endpoint/Edge/Zone/Publish/Archive mutators; gắn explicit authorization và negative tests.
  - **DoD / Acceptance:** STAFF/TECHNICIAN không mutate được thông qua curl/direct API, trong khi read được theo scope.
  - **Phụ thuộc / cùng slice:** `NV-01, IDN-04`.

- [~] **POL-04 — Map-assets public access decision** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** `/map-assets` public trước auth; chưa chốt đó là tài sản public hay cần signed URL.
  - **Cần triển khai:** Phân loại thumbnail vs occupancy/semantic bundle; public chỉ asset không nhạy cảm; xác thực hoặc URL ký có hạn cho bundle private; kiểm thử CORS/cache.
  - **DoD / Acceptance:** Danh mục asset công khai có chủ ý, protected assets không tải được khi không có quyền, robot vẫn fetch bundle chính xác.
  - **Phụ thuộc / cùng slice:** `WEB-MAP-01`.

#### Web + App — Permission-aware UX

- [ ] **BOTH-07 — Permission-aware shared frontend contract** `[P0]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Web/app đang dùng enum role và các capability hardcoded; chưa có contract chuẩn cho Technician.
  - **Cần triển khai:** Trả danh sách permissions/effective capabilities từ Identity hoặc policy endpoint; dùng chung typed DTO và condition rendering giữa Web/Expo.
  - **DoD / Acceptance:** Cùng user/role hai client hiển thị quyền nhất quán; đổi quyền có hiệu lực sau refresh/session policy.
  - **Phụ thuộc / cùng slice:** `IDN-04, APP-CAP-*`.

### D03 — Transportation, Batch, TR lifecycle & Business documents

#### Transport Request, cancellation and documents

- [ ] **WH-04 — TR Cancel / Reject / Pause theo từng trạng thái** `[P0]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Có cancel Job nhưng TR Cancel/Reject API riêng thiếu; cancel Job có thể để TR IN_PROGRESS (S13).
  - **Cần triển khai:** Thiết kế state transitions cho TR/Detail/Job/JobContainer; pre-pickup ≠ onboard ≠ delivered; cancel khi ONBOARD phải có quyền sở hữu/recovery. Hook UI và notifications.
  - **DoD / Acceptance:** Hủy trước pickup không thay tồn; hủy khi ONBOARD không coi hàng đã trả; TR aggregate terminal đúng kể cả toàn Detail CANCELLED.
  - **Phụ thuộc / cùng slice:** `TRN-01..03, WEB-TR-01, WH-01, FL-06`.

- [ ] **TRN-01 — Cancel TransportRequest endpoint** `[P0]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Domain có CANCELLED nhưng API Cancel TR và policy còn thiếu.
  - **Cần triển khai:** Add POST cancel hoặc action endpoint idempotent, conditional by state; fanout stop/Job cancellation/traffic custody và aggregate.
  - **DoD / Acceptance:** Admin được cancel theo rule; unauthorized 403, repeated cancel không double action; status TR/Detail/Job thống nhất.
  - **Phụ thuộc / cùng slice:** `WH-04, WEB-TR-01`.

- [ ] **TRN-02 — Reject TransportRequest** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Domain có REJECTED nhưng chưa có endpoint cho reviewer/admin.
  - **Cần triển khai:** Thêm reject reason, eligibility only before/during allowed stage, audit, response messages và thông báo Staff; không set arbitrary terminal khi đã chuyển hàng.
  - **DoD / Acceptance:** TR REJECTED có lý do/actor, không provision Job, dữ liệu Container không hỏng.
  - **Phụ thuộc / cùng slice:** `WH-04, OPS-02`.

- [ ] **TRN-03 — Pause/Resume cấp TR (nếu product cần)** `[P2]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Job có Resume nhưng chưa có quy tắc TR-wide pause/resume cho N Jobs.
  - **Cần triển khai:** Quyết định rõ có cần API TR pause hay chỉ dùng Job; nếu có thì orchestration theo từng Job/Container và partial progress.
  - **DoD / Acceptance:** Pause TR không làm thả authority sai/ mất Container custody; resume sau kiểm tra eligibility, idempotent.
  - **Phụ thuộc / cùng slice:** `WH-04, WFX-03`.

#### Web Transport management & contract

- [~] **WEB-TR-03 — Dispatch decision/candidate UI** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** UI ứng viên robot vẫn mock; chưa có dữ liệu selection explanation thật.
  - **Cần triển khai:** Expose decision/candidates từ Fleet; hiển thị eligible/ineligible reasons, scored factors và operator override permission.
  - **DoD / Acceptance:** Admin hiểu vì sao robot được chọn/loại, không tạo dispatch giả từ FE.
  - **Phụ thuộc / cùng slice:** `FL-01, FLT-01, BOTH-03`.

- [ ] **BOTH-04 — AvailableActions / reason server contract** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Thiếu DTO source of truth cho thao tác tùy state của TR/Job.
  - **Cần triển khai:** Định nghĩa `{action,allowed,reason}` cho each resource/user; enforce backend, FE render consistency.
  - **DoD / Acceptance:** Web/App cùng trạng thái và quyền; không client nào lách được state machine.
  - **Phụ thuộc / cùng slice:** `WH-04, WFX-03, IDN-04`.

### D04 — WorkflowExecution, Job/Step Runtime & Human Handover

#### Core runtime + supported step types

- [ ] **WFX-01 — WAIT step executor** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** WAIT xuất hiện trong catalog nhưng chưa có runtime xử lý.
  - **Cần triển khai:** Thêm wait_until/duration/timeout và cơ chế wake-up bền vững; không hold worker thread hay giữ lease tài nguyên quá hạn.
  - **DoD / Acceptance:** WAIT bắt đầu, hết điều kiện thì advance đúng 1 lần; timeout/cancel/resume không tạo orphan job.
  - **Phụ thuộc / cùng slice:** `WH-05, SY-02`.

- [ ] **WFX-03 — Operator manual Pause Job API** `[P0]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Có resume/auto pause nhưng chưa có Pause Job chủ động từ Admin/Staff hợp quyền.
  - **Cần triển khai:** Thêm lệnh soft-hold đến robot, state transition RUNNING→PAUSED, command acknowledgment/reconciliation và traffic occupancy; role-aware.
  - **DoD / Acceptance:** Manual pause dừng được motion rồi xác nhận PAUSED; resume không dùng command cũ; UI phân biệt requested/acknowledged/stopped.
  - **Phụ thuộc / cùng slice:** `RB-03, APP-CAP-07, WEB-FLEET-03`.

- [~] **WFX-05 — HUMAN operations tạo IssueReport thật** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Các HUMAN ops REPORT_ISSUE/MAINTENANCE có thể complete step nhưng không tạo ticket/incident.
  - **Cần triển khai:** Tách semantic action handlers: operation tạo side effect hợp lệ trong Operations, không chỉ AdvanceAsync; idempotent event+permission.
  - **DoD / Acceptance:** REPORT_ISSUE sinh IssueReport có correlation và chỉ advance sau khi operation thành công; failure có lý do.
  - **Phụ thuộc / cùng slice:** `OPS-01, RB-07`.

### D05 — Fleet Dispatch, Selection, Capacity & Multi-robot Assignment

#### Fleet backend / selection

- [ ] **FL-01 — Eligibility + explainable robot selection** `[P0]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Selector có một phần, ở audit cũ chủ yếu rank pin; robot busy/offline/battery UNKNOWN có thể chưa bị lọc đúng.
  - **Cần triển khai:** Lọc enable, online fresh, localized, available, map match, traffic constraints, battery confidence/minimum, payload capacity; score theo khoảng cách, idle/workload và cấu hình, trả reason.
  - **DoD / Acceptance:** Không dispatch robot thiếu điều kiện; candidate list và reasons có thể kiểm tra; robot mới nhỏ hơn có capacity/footprint riêng.
  - **Phụ thuộc / cùng slice:** `FL-03, FLT-01, BOTH-03`.

- [ ] **FL-02 — DispatchRobot operations API** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Chọn robot chủ yếu internal; thiếu endpoint/ops surface để review, dispatch và override có kiểm soát.
  - **Cần triển khai:** Add GET candidates/recommendation và POST dispatch/override guarded; trace command/decision, optimistic lock tránh double assign.
  - **DoD / Acceptance:** Hai operator cùng assign không trùng; override có reason và audit; UI hiển thị kết quả thật.
  - **Phụ thuộc / cùng slice:** `FL-01, WEB-TR-03`.

- [ ] **FLT-01 — Persist DispatchDecision** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** DbSet có nhưng code chưa ghi decision thực sự.
  - **Cần triển khai:** Persist candidate snapshot, ranking/filter reasons, selected robot, actor/system trigger, timestamps và correlation với Job.
  - **DoD / Acceptance:** Operator tra lịch sử decision lý do chọn/loại robot, không chỉ suy từ Job.AssignedRobotId.
  - **Phụ thuộc / cùng slice:** `FL-01, BOTH-03`.

### D06 — Navigation, Semantic Traffic, Map Assets & Facility UI

#### Traffic, route and map backend

- [ ] **NV-01 — EndpointGroup CRUD** `[P2]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Có entity/DB EndpointGroup nhưng thiếu endpoint cho cấu hình.
  - **Cần triển khai:** Implement CRUD/list validation group, map/version ownership và references; quyết định có dùng trong Parking/Map authoring không trước khi làm UI.
  - **DoD / Acceptance:** Admin tạo/sửa group đúng map version; không xóa group đang được workflow cần dùng.
  - **Phụ thuộc / cùng slice:** `POL-01, FL-08`.

### D07 — Robot Edge, Safety, Battery & Deployment

#### Robot control, battery and health

- [ ] **HW-04 — Voltage-only battery telemetry cho RBT-001** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Đã chốt cảm biến chia áp DC0–25V tới ESP32-S3 ADC1 GPIO1 (backup GPIO2), chưa gắn và chưa đo; BMS thường không smart.
  - **Cần triển khai:** Xác minh MKE-K01 pinout, off-state backfeed, nối divider sau switch có bảo vệ, ADC 12dB calibration, 1kΩ/100nF filter; ESP32→serial→gateway→Fleet truyền measured voltage/estimated SOC/quality.
  - **DoD / Acceptance:** Vbatt so với đồng hồ đo trong các mức tải, UI unknown khi thiếu; charging/current/temp để unavailable; production dispatch unknown fail-closed, dev override explicit.
  - **Phụ thuộc / cùng slice:** `FL-01, RB-02`.

### D08 — Technician, Fault Catalog, Issue / Incident & Recovery

#### Technical dashboard, escalation and maintenance

- [ ] **RB-08 — Maintenance / Out-of-service / Return-to-service** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Robot enable/disable có phần nền, chưa có maintenance workflow, checklist hay validation.
  - **Cần triển khai:** Bổ sung maintenance ticket/session, lock auto dispatch, check sensor/localization/stop/traffic, require authorized technician release.
  - **DoD / Acceptance:** Robot maintenance bị loại khỏi selection; chỉ return available khi checklist pass và owner confirm, lịch sử sửa chữa tồn tại.
  - **Phụ thuộc / cùng slice:** `RB-05, FL-01`.

#### Backend Operations + App/Web Issue surfaces

- [ ] **OPS-01 — IssueReport CRUD + lifecycle** `[P0]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Mongo schema có nhưng Operations features mới ưu tiên notification, thiếu create/query/assign/resolve endpoints.
  - **Cần triển khai:** Implement endpoints with scope authorization, media metadata, linked entities, issue type/severity, concurrency and reliable notifications.
  - **DoD / Acceptance:** Issue qua App/Web tạo được và lưu bền; hỗ trợ status, assignee, evidence, audit; không tự tạo issue vì handover mismatch nếu chưa có policy.
  - **Phụ thuộc / cùng slice:** `RB-07, APP-CAP-04, BOTH-08`.

### D09 — Observability, Audit, Notifications & Historical Read Models

#### System trace / error surfaces / operations logging

- [~] **SY-04 — Recipient-targeted notification deep links** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Có event/notification nhưng thiếu URL/route đích và per-user recipients; inbox Admin shared.
  - **Cần triển khai:** Payload chuẩn targetType/targetId/route, recipient user/role/site, read/unread, dedup và link tới Issue/Job/TR/Robot.
  - **DoD / Acceptance:** Nhấn notification mở đúng entity theo quyền; Staff không nhận thông báo robot khác ngoài scope.
  - **Phụ thuộc / cùng slice:** `OPS-03, WEB-NOTIF-01`.

- [ ] **SY-05 — AuditLog write/read thực tế** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Mongo audit schema có nhưng không có writer/reader xuyên module.
  - **Cần triển khai:** Capture actor, action, target, before/after, reason, command status/time, source IP/device theo policy; reader/query scope/retention.
  - **DoD / Acceptance:** Thao tác manual stop, change role, cancel TR, handover, stock mutations đều truy được lịch sử.
  - **Phụ thuộc / cùng slice:** `OPS-02`.

- [ ] **OPS-02 — Audit CRUD/write/query endpoints** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Schema audit có, chưa có dữ liệu phát sinh từ action và reader.
  - **Cần triển khai:** Implement audit publisher/reader theo module events (P0 actions trước), chống sensitive data logging, correlation và phân quyền Admin/Technician.
  - **DoD / Acceptance:** Audit chứa log thật cho sample create TR, change role, manual control, stock commit; filtering và retention policy.
  - **Phụ thuộc / cùng slice:** `SY-05`.

- [ ] **OPS-03 — Notifications per Staff / per User** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Hiện shared Admin inbox Guid.Empty, AdminOnly; Staff không có inbox server cá nhân.
  - **Cần triển khai:** Model recipients, actor/site resolution, per-user inbox, read/unread, delivery semantics, role authorization.
  - **DoD / Acceptance:** Staff nhận handover task họ được claim, Admin nhận issue escalation, user B không đọc inbox user A.
  - **Phụ thuộc / cùng slice:** `SY-04, APP-OPS-04`.

- [~] **RTM-01 — SignalR hubs authorization / Staff groups** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** SignalR đã có live robot/job/step một phần nhưng hubs/group auth chưa rõ ràng.
  - **Cần triển khai:** RequireAuthorization explicit, group membership by identity/site/permissions, token expiry handling, reconnection/resubscribe.
  - **DoD / Acceptance:** Client không subscribe robot/site trái quyền, token hết hạn ngắt; nhận update hợp lệ trong SLA cam kết.
  - **Phụ thuộc / cùng slice:** `IDN-04, OPS-03`.

- [~] **RTM-02 — Realtime TR progress/traffic pushes** `[P1]`
  - **Owner:** Nguyễn Trung Nguyên.
  - **Hiện trạng (theo audit):** Có push robot/job/step/notification; TR aggregate và traffic state chưa đầy đủ realtime.
  - **Cần triển khai:** Emit TR progress, Detail transitions, traffic hold reason/grants và targeted events sau commit, refresh fallback khi event drop.
  - **DoD / Acceptance:** Web/App status chuyển đúng khi TR partial, blocked, confirmed; client reconnect khôi phục từ API.
  - **Phụ thuộc / cùng slice:** `WH-04, FL-05, SY-06`.

---

## Hồ Sỹ Thắng

### D01 — Identity, Authentication, Authorization & Security

#### Web + App — Permission-aware UX

- [~] **WEB-MGMT-01 — Roles UI / permission-aware management** `[P1]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Admin Web hiển thị enum ADMIN/STAFF, không có TECHNICIAN hay permission matrix.
  - **Cần triển khai:** Thêm role picker, hiển thị capabilities và route/action guard theo server permissions; tránh UI tự suy quyền từ string role.
  - **DoD / Acceptance:** Admin tạo Technician và quyền đúng, UI không hiển thị thao tác cấm; backend vẫn là SoT authz.
  - **Phụ thuộc / cùng slice:** `RB-01, BOTH-07`.

### D02 — Warehouse: Product, Container, Stock & Receiving

#### Backend — master data / inventory truth

- [ ] **WH-02 — Receiving scan + ResolveProduct API→App** `[P0]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** ResolveProduct/inventory context có handler nhưng route chưa map đủ; màn hình app bị capability lock.
  - **Cần triển khai:** Expose barcode/SKU resolution, receiving/create-container endpoints; validate product active, warehouse context và nguồn scan; kết nối App capability sau khi backend test.
  - **DoD / Acceptance:** Quét SKU hợp lệ tạo Container đúng ProductId; unknown/inactive SKU trả lỗi rõ; TR chỉ nhận Container eligible.
  - **Phụ thuộc / cùng slice:** `APP-CAP-02, APP-CAP-03`.

- [ ] **WHM-01 — Master data Update/Delete/Deactivate** `[P2]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Warehouse, Product, Category, StorageLocation chủ yếu có Create/List/SetStatus, các mutation còn thiếu.
  - **Cần triển khai:** Thêm Update/Delete/deactivate theo entity; kiểm tra FK/usage history không xóa dữ liệu đã dùng trong TR/Job, xử lý concurrency.
  - **DoD / Acceptance:** Admin chỉnh hợp lệ, xóa entity đang tham chiếu bị chặn hoặc soft-delete; các client refetch không gặp dữ liệu mồ côi.
  - **Phụ thuộc / cùng slice:** `WEB-MGMT-02, OPS-02`.

- [ ] **WHM-02 — Container lifecycle APIs** `[P1]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Container entity chủ yếu reserve từ CREATED; chưa có full state transitions PACKED, IN_TRANSIT, STORED, HOLD, EMPTY, OOS.
  - **Cần triển khai:** Định nghĩa state machine thật với service/API/guards và transitions do workflow/Staff xác nhận. Phân biệt Container physical state và JobContainer progress.
  - **DoD / Acceptance:** Transition sai trả 409; query hiện state đúng sau handover, hold/recovery/out-of-service; test cạnh tranh cập nhật.
  - **Phụ thuộc / cùng slice:** `WH-01, WH-04, FL-06`.

- [ ] **WHM-03 — InventoryStock write path** `[P0]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Inventory list/context chỉ đọc; CreateContainer không tự cộng tồn.
  - **Cần triển khai:** Cài transaction/movement ledger cho reserve, release, receive, transfer, issue dựa trên Container event; chống stock âm và duplicate posting.
  - **DoD / Acceptance:** InventoryStock tăng/giảm/chuyển chính xác theo nghiệp vụ; 2 event trùng không nhân đôi; failure rollback/reconcile.
  - **Phụ thuộc / cùng slice:** `WH-01, WHM-04`.

- [ ] **WHM-04 — IWarehouseModule mutation contract cho handover** `[P0]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Public Warehouse contract hiện read-only, Workflow/Fleet chưa thể cập nhật kho qua boundary đúng chuẩn.
  - **Cần triển khai:** Expose explicit validated commands (apply confirmed handover, reserve/release/move Container, reconcile) thay vì module khác ghi trực tiếp DB Warehouse.
  - **DoD / Acceptance:** Workflow tích hợp kho qua contract có idempotency và failure propagation; không trùng domain owner.
  - **Phụ thuộc / cùng slice:** `WH-01, WHM-03`.

#### Web/App — nhận hàng, tra cứu, đồng bộ

- [~] **WEB-MGMT-02 — Container UI read-only** `[P1]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Admin Web có danh sách Container nhưng không có receiving/packing mutation đầy đủ.
  - **Cần triển khai:** Cho phép quản trị/inspection qua UI phù hợp role; nếu Staff receiving thực hiện ở app thì Web read-only có chủ ý, gắn link/detail tình trạng và lý do không được sửa.
  - **DoD / Acceptance:** Không còn giả mạo khả năng receiving qua nút chết; record được xem cùng ProductId, location và số liệu kho đúng.
  - **Phụ thuộc / cùng slice:** `WH-02, WHM-02`.

- [ ] **BOTH-10 — Post-handover stock/location phản ánh trên UI** `[P0]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Sau confirm UI/DB có thể chỉ cập nhật JobContainer, Stock/Container location chưa write-back.
  - **Cần triển khai:** Expose/read fresh Warehouse mutation result, invalidation/refetch hoặc SignalR và hiển thị trạng thái sync pending/error rõ.
  - **DoD / Acceptance:** Mở lại Container và Inventory sau handover thấy trạng thái chính xác, không chốt Done nếu kho vẫn sai.
  - **Phụ thuộc / cùng slice:** `WH-01, WHM-03, BOTH-06`.

### D03 — Transportation, Batch, TR lifecycle & Business documents

#### Transport Request, cancellation and documents

- [ ] **WH-07 — Phiếu nhập/xuất kho có trạng thái** `[P1]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Thiếu Receiving/Issue slip đầy đủ liên kết Containers, stock ledger, TR.
  - **Cần triển khai:** Thiết kế phiếu nhập/xuất, line items, actor, chứng từ gốc và thời điểm stock commit; liên kết Container/Detail/TR và audit.
  - **DoD / Acceptance:** Mỗi nghiệp vụ stock có chứng từ phù hợp, không duplicate posting; đối soát từ phiếu đến TR/Job/Container được.
  - **Phụ thuộc / cùng slice:** `WH-01, WHM-03`.

#### Web Transport management & contract

- [ ] **WEB-TR-01 — Cancel TR button thực sự gọi API** `[P0]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Nút Cancel hiển thị theo `availableActions` nhưng không có onClick hoặc cancel client.
  - **Cần triển khai:** Nối confirmation dialog, reason, error, API và refresh status; disable khi backend không cho cancel.
  - **DoD / Acceptance:** Click cancel tạo một request, state server cập nhật, stale/forbidden báo lý do, không chỉ đóng modal.
  - **Phụ thuộc / cùng slice:** `TRN-01, BOTH-04`.

- [~] **WEB-TR-02 — JobSummaryPanel bỏ jobs/mock** `[P1]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** JobDetailPage đã wired nhưng summary còn đọc `jobs/mock`.
  - **Cần triển khai:** Thay bằng read DTO thật, handle pagination/error/refetch, ưu tiên status từ server.
  - **DoD / Acceptance:** Danh sách và detail một Job thể hiện cùng dữ liệu; không còn mock trong production route.
  - **Phụ thuộc / cùng slice:** `BOTH-06`.

- [~] **WEB-TR-04 — Action availability từ backend** `[P1]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** FE tự suy `availableActions` từ status, dễ lệch domain và quyền.
  - **Cần triển khai:** Đưa allowed actions cùng reason từ backend cho TR/Job; check lại server lúc thực thi; handle optimistic concurrency.
  - **DoD / Acceptance:** Nút chỉ cho thao tác hợp lệ, trạng thái thay đổi giữa chừng nhận 409/reason đúng.
  - **Phụ thuộc / cùng slice:** `BOTH-04`.

### D05 — Fleet Dispatch, Selection, Capacity & Multi-robot Assignment

#### Fleet views / server–client DTOs

- [~] **WEB-FLEET-01 — Map robot current activity/Job** `[P1]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Live map có position nhưng `activity` luôn null hoặc backend TODO.
  - **Cần triển khai:** Expose RobotActivity + current JobAssignment read DTO và realtime invalidation, có timestamps/staleness.
  - **DoD / Acceptance:** Map chỉ rõ robot đang chạy Job nào, step nào; no activity đúng khi idle, không fake.
  - **Phụ thuộc / cùng slice:** `BOTH-01`.

- [~] **WEB-FLEET-02 — Robot detail recent jobs + state history** `[P1]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Robots detail dùng `robots/mock.ts` cho history/recent jobs.
  - **Cần triển khai:** Dùng persisted Robot state transition/JobAssignment read endpoints có paging, retention; fallback unknown có thông báo.
  - **DoD / Acceptance:** Không còn dữ liệu lịch sử giả ở production, liên kết đúng Job/command/time.
  - **Phụ thuộc / cùng slice:** `BOTH-02, SY-07`.

- [ ] **WEB-FLEET-03 — Pause / Unavailable / Localize actions** `[P0]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Nút hiện nhưng chưa có onClick thực (Manual có).
  - **Cần triển khai:** Nối từng action vào backend capability/status; Pause uses WFX-03; Unavailable disable dispatch; Localize chỉ khi robot/gateway có command support.
  - **DoD / Acceptance:** Nút trả trạng thái requested→ACK/result thật; action unsupported bị disabled có lý do.
  - **Phụ thuộc / cùng slice:** `WFX-03, RB-03, FLT-02`.

- [~] **WEB-FLEET-04 — Error confirm UI mới là local state** `[P2]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Robot error acknowledgement trên web chưa có API transition server-side.
  - **Cần triển khai:** Thiết kế acknowledge/clear non-safety fault có actor/time/reason; phân biệt ack receipt với fault resolved; safety fault không clear tùy tiện.
  - **DoD / Acceptance:** Refresh vẫn thấy ack/resolve state chuẩn, khác user đồng bộ, audit đầy đủ.
  - **Phụ thuộc / cùng slice:** `RB-06, OPS-01`.

- [~] **WEB-FLEET-05 — Remove LIVE_MAP_LABEL mock** `[P2]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Map label hardcoded thay vì dữ liệu map/version/live state.
  - **Cần triển khai:** Map metadata/robot DTO cung cấp label/location/mode và stale; chỉ dùng mock khi explicit dev-mode.
  - **DoD / Acceptance:** Production label đúng map đang active và robot, không tạo cảm giác live sai.
  - **Phụ thuộc / cùng slice:** `WEB-MAP-01, BOTH-01`.

- [ ] **WEB-FLEET-07 — Dedicated Jobs monitoring list** `[P2]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** `/monitor/jobs` redirect, thiếu list/filter/timeline chuyên dụng.
  - **Cần triển khai:** Xây trang JobMonitor với trạng thái, assigned robot, TR, Container, error, action và drilldown.
  - **DoD / Acceptance:** Tìm được Job theo robot/ID/status, chọn row tới detail đúng và dữ liệu realtime.
  - **Phụ thuộc / cùng slice:** `BOTH-06`.

### D06 — Navigation, Semantic Traffic, Map Assets & Facility UI

#### Traffic, route and map backend

- [~] **WEB-MAP-01 — Facility scene fallback mock / empty geometry** `[P1]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** `scene.ts` có fallback mock; preview khi geometry trống có thể hiển thị dữ liệu không thực.
  - **Cần triển khai:** Lấy MapAssets/geometry/version thật; hiển thị explicit empty/loading/error; chỉ dùng mock trong dev demo mode.
  - **DoD / Acceptance:** Production không hiển thị layout sai; fingerprint/version rõ, map publish/preview nhất quán.
  - **Phụ thuộc / cùng slice:** `POL-04`.

- [~] **WEB-MAP-02 — MapVersion author/notes/modifiedAt** `[P2]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Có UI placeholder/TODO backend cho author, notes, modifiedAt.
  - **Cần triển khai:** Bổ sung read/audit metadata hoặc bỏ field khỏi UI nếu không phải SoT; phân biệt draft/published immutable.
  - **DoD / Acceptance:** Map edit history hiển thị đúng actor/timestamp, không đoán dựa vào client clock.
  - **Phụ thuộc / cùng slice:** `OPS-02`.

### D08 — Technician, Fault Catalog, Issue / Incident & Recovery

#### Technical dashboard, escalation and maintenance

- [~] **RB-02 — Robot Technical Dashboard realtime** `[P0]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Fleet live pose đã có nhưng robot state history, sensor health, authority và battery confidence chưa full backend contract.
  - **Cần triển khai:** Tạo Technical Overview theo robot: status/mode/pose/job/command, Nav2 localization, LiDAR/IMU/encoder, battery voltage/SOC confidence, reservations, last heartbeat, fault history, control lease.
  - **DoD / Acceptance:** Hiển thị live vs stale, available vs unsupported; nhấp được vào Job/Issue; không trộn dữ liệu mock với live.
  - **Phụ thuộc / cùng slice:** `RB-10, BOTH-09, BOTH-01`.

- [ ] **RB-07 — Incident Center: triage → close** `[P0]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Issue report domain có dấu vết nhưng chưa CRUD + triage/lifecycle đầy đủ.
  - **Cần triển khai:** Thiết kế OPEN→TRIAGED→ASSIGNED→IN_PROGRESS→RESOLVED→VERIFIED→CLOSED, reopen/cancel; link Robot/Job/TR/Step/Container/map/resource và evidence photo.
  - **DoD / Acceptance:** Staff tạo Issue, Technician xử lý lỗi robot, Admin triage/escalate; không thể close safety issue chưa verify, audit mọi chuyển trạng thái.
  - **Phụ thuộc / cùng slice:** `OPS-01, BOTH-08, RB-06`.

#### Backend Operations + App/Web Issue surfaces

- [ ] **BOTH-08 — Incident Center shared Web + App** `[P0]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Chưa có full incident pages/typed DTO nối OPS-01.
  - **Cần triển khai:** Tạo read/create/update API contract, filtered views theo role, robot/job links, attachment ref và realtime notification.
  - **DoD / Acceptance:** Cùng Issue ID hiển thị đúng trên cả hai client, actions giới hạn theo quyền/stage.
  - **Phụ thuộc / cùng slice:** `OPS-01, RB-07`.

- [ ] **BOTH-09 — Technical Dashboard uses real data** `[P0]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Robot technical web detail còn mock history và thiếu aggregated health.
  - **Cần triển khai:** Dùng Fleet/Robot Health DTOs thật, time series hoặc latest per subsystem, lastUpdated/source; offer stop/manual only by policy.
  - **DoD / Acceptance:** Không hiển thị giá trị giả cho battery current/temp/charging, Nav2 state stale bị gắn stale.
  - **Phụ thuộc / cùng slice:** `RB-02, BOTH-01, BOTH-02`.

### D09 — Observability, Audit, Notifications & Historical Read Models

#### System trace / error surfaces / operations logging

- [~] **SY-08 — User-visible failure reason & next action** `[P0]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** UI thường có RUNNING/FAILED/PAUSED nhưng không giải thích rõ planner/traffic/robot offline/need recovery.
  - **Cần triển khai:** Chuẩn hóa error contract code, origin, retryable, nextAction, incidentId, stale status và bounded retry; map thông báo ngôn ngữ dễ hiểu.
  - **DoD / Acceptance:** Một job blocked chỉ rõ lý do chờ, cần ai xử lý và action an toàn; command timeout không hiển thị success.
  - **Phụ thuộc / cùng slice:** `RB-06, BOTH-04`.

- [~] **WEB-NOTIF-01 — Notifications center page** `[P1]`
  - **Owner:** Hồ Sỹ Thắng.
  - **Hiện trạng (theo audit):** Chỉ có bell dropdown, chưa có trang inbox/filter/history.
  - **Cần triển khai:** Tạo notifications list/detail với unread filters, deep link, recipients, pagination; giữ bell như shortcut.
  - **DoD / Acceptance:** User tìm lại cảnh báo cũ, click đúng Job/TR/Issue và read state sync.
  - **Phụ thuộc / cùng slice:** `OPS-03, SY-04`.

---

## Nguyễn Thành Đạt

### D02 — Warehouse: Product, Container, Stock & Receiving

#### Web/App — nhận hàng, tra cứu, đồng bộ

- [ ] **APP-CAP-02 — Unlock createContainer receiving** `[P0]`
  - **Owner:** Nguyễn Thành Đạt.
  - **Hiện trạng (theo audit):** App có screen tạo Container nhưng flag false; cần kiểm chứng CreateContainer BE thật và validation.
  - **Cần triển khai:** Nối form, barcode scan, ProductId, location context tới API; xử lý 409/validation/offline; chỉ bật flag sau integration.
  - **DoD / Acceptance:** Staff tạo Container V1 1 Product type, query thấy ID/barcode đúng, lỗi được hiển thị thay vì ẩn screen.
  - **Phụ thuộc / cùng slice:** `WH-02, WHM-02`.

- [ ] **APP-CAP-03 — Unlock ResolveProduct ở receiving** `[P0]`
  - **Owner:** Nguyễn Thành Đạt.
  - **Hiện trạng (theo audit):** App capability=false dù có nhu cầu scan supplier barcode/resolve Product.
  - **Cần triển khai:** Map endpoint Product resolution, scanner code→SKU/ProductId, invalid/unknown state và loading/error feedback; không tự tạo Product giả.
  - **DoD / Acceptance:** Unknown barcode chặn việc gán Product, valid scan chuẩn bị Container đúng và được tích hợp với create.
  - **Phụ thuộc / cùng slice:** `WH-02`.

### D04 — WorkflowExecution, Job/Step Runtime & Human Handover

#### Handover actor, timeout & staff ops

- [ ] **APP-CAP-01 — Staff My Tasks: claim/accept** `[P0]`
  - **Owner:** Nguyễn Thành Đạt.
  - **Hiện trạng (theo audit):** Screen có, `claimHumanTask` flag false vì backend claim chưa wire.
  - **Cần triển khai:** Expose claim endpoint và event; bật flag sau contract tests; hiển thị status claimed/by whom/deadline và confirm only with lease.
  - **DoD / Acceptance:** Staff A claim rồi B không confirm thay; expired lease re-offer; no-shows hiển thị.
  - **Phụ thuộc / cùng slice:** `WH-03`.

- [ ] **APP-CAP-07 — Staff Pause/Soft Hold Job** `[P0]`
  - **Owner:** Nguyễn Thành Đạt.
  - **Hiện trạng (theo audit):** App hiện safety hold local, capability pauseJob=false.
  - **Cần triển khai:** WFX-03 cung cấp operator hold API, app show command status, force refresh, require reason và permissions.
  - **DoD / Acceptance:** Nhấn pause từ app có server confirmation; offline không giả báo PAUSED; resume sau readiness check.
  - **Phụ thuộc / cùng slice:** `WFX-03, RB-03`.

### D07 — Robot Edge, Safety, Battery & Deployment

#### App technical control / robot map

- [ ] **APP-FLEET-01 — Mobile Technician teleop** `[P2]`
  - **Owner:** Nguyễn Thành Đạt.
  - **Hiện trạng (theo audit):** Teleop chỉ Web; mobile joystick chưa có.
  - **Cần triển khai:** Chỉ thêm nếu tablet/mobile technical workflow cần; dùng cùng backend lease/dead-man, visibility và link watchdog; ưu tiên read/stop trên mobile trước.
  - **DoD / Acceptance:** Không có luồng mobile nào bypass quyền/safety; mất foreground/link → stop, không tự resume.
  - **Phụ thuộc / cùng slice:** `RB-04, BOTH-07`.

- [~] **APP-FLEET-02 — Interactive map opt-in Expo** `[P2]`
  - **Owner:** Nguyễn Thành Đạt.
  - **Hiện trạng (theo audit):** Có EXPO_PUBLIC_INTERACTIVE_MAP, chưa chắc mặc định/on production và telemetry đầy đủ.
  - **Cần triển khai:** Kiểm thử performance map native theo robot pose/version, stale state và gesture; chọn safe fallback khi unsupported.
  - **DoD / Acceptance:** Staff thấy vị trí đúng/map đúng, không lấy demo mock khi map không load; giới hạn battery/data.
  - **Phụ thuộc / cùng slice:** `BOTH-01, WEB-MAP-01`.

### D08 — Technician, Fault Catalog, Issue / Incident & Recovery

#### Backend Operations + App/Web Issue surfaces

- [ ] **APP-CAP-04 — Staff Report Issue modal thực sự submit** `[P0]`
  - **Owner:** Nguyễn Thành Đạt.
  - **Hiện trạng (theo audit):** Modal reportIssue đang disabled; sai handover không auto issue.
  - **Cần triển khai:** Nối form issue code/category, photo, Container/Job/Step refs tới OPS-01; authorize Staff được tạo, không được self-close technical issue.
  - **DoD / Acceptance:** Report mất/sai Container tạo ticket thật và Staff thấy ID/tracking; offline không báo success giả.
  - **Phụ thuộc / cùng slice:** `OPS-01, WH-03`.

- [ ] **APP-CAP-05 — Blocked path / hazard reporting** `[P1]`
  - **Owner:** Nguyễn Thành Đạt.
  - **Hiện trạng (theo audit):** UI có nút/đường nhập nhưng submit disabled.
  - **Cần triển khai:** Expose hazard Incident với map/zone/pose, photo, severity và traffic review; không tự động mutate keepout/map mà thiếu permission.
  - **DoD / Acceptance:** Staff report được vị trí chặn và Admin/Technician nhận cảnh báo; lane policy được quản lý bởi authorized owner.
  - **Phụ thuộc / cùng slice:** `OPS-01, FL-05`.

- [ ] **APP-CAP-06 — Payload recovery Staff flow** `[P1]`
  - **Owner:** Nguyễn Thành Đạt.
  - **Hiện trạng (theo audit):** App có giao diện recovery nhưng nút disabled/returns 501; backend chưa close ownership.
  - **Cần triển khai:** Nối nhận case, scan Container chuyển robot, approval/confirm, replacement robot assignment và reconcile quarantine/stock; bắt buộc chứng cứ custody.
  - **DoD / Acceptance:** Không có double ownership; khi failed robot mang hàng, Recovery UI buộc Staff xác nhận trước khi resume.
  - **Phụ thuộc / cùng slice:** `WFX-04, FL-06`.

### D09 — Observability, Audit, Notifications & Historical Read Models

#### System trace / error surfaces / operations logging

- [~] **APP-OPS-04 — Persistent Staff notifications inbox** `[P1]`
  - **Owner:** Nguyễn Thành Đạt.
  - **Hiện trạng (theo audit):** App derive local notification; Ops inbox backend AdminOnly.
  - **Cần triển khai:** Kết nối per-user inbox + push/SignalR, deep links và read/unread; handle transient offline.
  - **DoD / Acceptance:** Đăng nhập lại vẫn xem thông báo của chính Staff; click mở đúng claimed job/Container.
  - **Phụ thuộc / cùng slice:** `OPS-03, SY-04`.

- [~] **APP-OPS-01 — Work-zone filtering theo backend ownership** `[P1]`
  - **Owner:** Nguyễn Thành Đạt.
  - **Hiện trạng (theo audit):** App dùng local label filtering, không có assignment/ownership theo zone từ backend.
  - **Cần triển khai:** Expose actor/site/work-zone claims, assignment and queue criteria; do not use label to enforce authorization.
  - **DoD / Acceptance:** Staff chỉ claim/confirm tasks thuộc work-zone được phép; thay zone đúng trên server được cập nhật.
  - **Phụ thuộc / cùng slice:** `WH-03, IDN-04`.

---

## Nguyễn Quốc Khải

### D01 — Identity, Authentication, Authorization & Security

#### Security policies / access boundary

- [x] **POL-02 — Workflow authoring/publishing policies** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Create/Publish/Update/Delete workflow có nguy cơ dựa vào FallbackPolicy.
  - **Cần triển khai:** Áp policy quản trị cho create/edit/publish/delete; đảm bảo published workflow immutable, policy versioning.
  - **DoD / Acceptance:** Chỉ Admin được publish, STAFF nhận 403; mọi publish có actor, version, audit.
  - **Phụ thuộc / cùng slice:** `WH-05, OPS-02`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/khai-*`, chưa merge):** 5 route ghi trả 403 cho STAFF và TECHNICIAN, publish ghi người và version vào row và audit (`SensitiveRouteAuthorizationTests`, `WorkflowTemplateIntegrationTests`).

- [x] **POL-03 — Fleet sensitive-command authorization** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Fleet Register/Enable/Disable/Teleop/Navigate/Cancel mới một phần AdminOnly.
  - **Cần triển khai:** Kiểm kê toàn route và websocket/command endpoints; phân quyền theo command, robot scope, safety guard; không cho kỹ thuật viên bypass stop/authority gate.
  - **DoD / Acceptance:** Negative authorization test trên từng endpoint; không chỉ ẩn button trên Web.
  - **Phụ thuộc / cùng slice:** `RB-01, RB-03, RB-04`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/khai-*`, chưa merge):** Test bảng duyệt mọi route Fleet, route mới chưa khai báo làm test đỏ, ngoài scope nhận 403 qua HTTP thật. Lái tay trong bảo trì vẫn cho phép có chủ ý (lease, STOP, scope vẫn áp dụng).

### D02 — Warehouse: Product, Container, Stock & Receiving

#### Backend — master data / inventory truth

- [~] **WH-01 — Commit Container location + InventoryStock đúng sau handover** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Có JobContainer ONBOARD/DELIVERED và Detail aggregate; chưa có mutation kho theo confirmed delivery nên Job COMPLETE có thể để sai vị trí/tồn.
  - **Cần triển khai:** Thiết kế sự kiện bàn giao đã xác thực; Warehouse module cập nhật Container.location/status, InventoryStock, movement ledger theo receiving/outbound/relocation policy và unique idempotency key. Phân định stock posted ở event nào.
  - **DoD / Acceptance:** Cả pickup/delivery, retry event và cancel đều không ghi kho hai lần; Stock/location luôn khớp custody thực tế; integration test transaction + duplicate.
  - **Phụ thuộc / cùng slice:** `WHM-03, WHM-04, BOTH-10, SY-06`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/khai-*`, chưa merge):** Lấy hàng trừ tồn, giao xong cộng, sổ `container_movements` khóa unique, hàng đợi thử lại, khôi phục vị trí. Còn thiếu: crash giữa commit Job và handler vẫn mất event (SY-06); chưa chạy trên robot thật.

#### Web/App — nhận hàng, tra cứu, đồng bộ

- [~] **BOTH-06 — Unified list/read DTOs có tên join thật** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** TR/Job/Container/Inventory UI cần nhiều join chưa có nên còn mock/fallback.
  - **Cần triển khai:** Cung cấp DTO read model có containerCode, product display, warehouse/location, assignee, status và timestamps được phép đọc; query có paging.
  - **DoD / Acceptance:** Không cần mock tên entity trong luồng chính, API data khớp DB và không lộ thông tin ngoài scope.
  - **Phụ thuộc / cùng slice:** `BOTH-01, BOTH-05`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/khai-*`, chưa merge):** Job có request code, robot, barcode, workflow; TR có tên người tạo; có phân trang; ẩn robot ngoài scope. Còn thiếu: App chưa hiển thị hết trường mới; mock vẫn còn khi bật `VITE_MOCK_AUTO_LOGIN`.

### D03 — Transportation, Batch, TR lifecycle & Business documents

#### Batch planning / split / partial failure

- [~] **WH-08 — Một TR nhiều Batch/Job, mỗi Batch đúng một Job** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Planner V1 thường tạo một Job BATCH-001 cho mọi Detail; mô hình Batch có thể chưa là entity độc lập.
  - **Cần triển khai:** Audit current provisioningKey và JobContainer mapping; thiết kế 1 TR→N Batch, 1 Batch→1 Job, split idempotent, quy tắc capacity/route; migrate chỉ khi cần.
  - **DoD / Acceptance:** Một Detail thuộc đúng batch/Job, retry queue không duplicate; partial TR aggregate phản ánh các Jobs khác nhau.
  - **Phụ thuộc / cùng slice:** `FL-03, FL-04, WH-10`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/khai-*`, chưa merge):** Chia theo `MaxContainersPerJob`, retry và queue đồng thời không trùng, Job sau tự chạy, E2E robot mô phỏng đạt (`test_batch_flow.py`). Còn thiếu: giới hạn chung chưa theo từng robot (FL-03).

- [~] **WH-09 — Recurring waves / multi-trip requests** `[P2]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** F05/F07/F11: scheduling, nhiều đợt và chia chuyến chưa có thực thi.
  - **Cần triển khai:** Tạo recurrence/wave, grouping/split planner, limits theo payload/container count và temporal status; không tạo Job vô hạn do retry.
  - **DoD / Acceptance:** Một lịch tạo đúng waves, mỗi wave có batch/Job/trip tracking và pause/cancel riêng khi chưa bắt đầu.
  - **Phụ thuộc / cùng slice:** `WH-08, FL-03, FL-07`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/khai-*`, chưa merge):** Lịch theo quy tắc, đợt unique, SKIPPED, MISSED, FAILED không thử lại, hủy riêng từng đợt, màn hình Web. Còn thiếu: quy tắc là giả định vì repo không mô tả F05/F07/F11; không có màn hình App; request chờ người start.

- [x] **WH-10 — Partial failure per Container trong một Job** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Job engine chưa thiết kế kết quả một Container thành công một Container lỗi độc lập.
  - **Cần triển khai:** Thêm per-container outcome, compensation logic không rollback dữ liệu đã giao, aggregate TR Detail theo kết quả thực.
  - **DoD / Acceptance:** A delivered, B failed → A vẫn giao, B fail/recovery, TR PARTIALLY_COMPLETED theo policy.
  - **Phụ thuộc / cùng slice:** `WH-01, WH-08`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/khai-*`, chưa merge):** `POST /job-steps/{id}/fail-container`, A giao B lỗi: A giữ nguyên, B FAILED rồi khôi phục được, TR tổng hợp từ Detail (`JobExecutionEngineTests`). Có nút trên Web và App.

### D04 — WorkflowExecution, Job/Step Runtime & Human Handover

#### Core runtime + supported step types

- [x] **WH-05 — CHECK.WAIT / LOAD_STATE / INVENTORY_AVAILABLE implementation** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Catalog có WAIT và các CHECK operation nhưng engine V1 trả step_type_not_supported.
  - **Cần triển khai:** Viết step executors/evaluators, input binding, timeout, retry/onFailure và publish-time validator; CHECK phải dùng dữ liệu Inventory/Container chính xác.
  - **DoD / Acceptance:** Workflow có bước tương ứng chạy trong unit/integration; false condition không được tự complete; không còn publish được workflow chắc chắn fail.
  - **Phụ thuộc / cùng slice:** `WFX-01, WFX-02`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/check-step-evaluators`, chưa merge):** LOAD_STATE, INVENTORY_AVAILABLE chạy thật; CHECK sai thì chờ và thử lại theo MaxAttempts/TimeoutSeconds, lưu trên step; publish từ chối CHECK không có evaluator và retry ngoài giới hạn (`JobExecutionEngineTests`, `WorkflowDefinitionValidatorTests`).

- [x] **WFX-02 — Evaluate LOAD_STATE / INVENTORY_AVAILABLE** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** CHECK operations trong catalog chưa evaluation thực sự bằng domain contract.
  - **Cần triển khai:** Thêm evaluator truy Warehouse custody/location/stock tại thời điểm execution; reason codes, race check và validation inputs.
  - **DoD / Acceptance:** Container không onboard hay stock thiếu → CHECK failed/pause theo policy; đủ điều kiện → tiếp tục, có test concurrent stock change.
  - **Phụ thuộc / cùng slice:** `WH-05, WHM-04`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/check-step-evaluators`, chưa merge):** INVENTORY_AVAILABLE đọc Warehouse lúc chạy (thùng đổi trạng thái giữa hai lần thử được thấy). LOAD_STATE đọc handover đã xác nhận: robot không có cảm biến tải, nên là custody theo phần mềm.

- [~] **WH-06 — Workflow catalog E2E Inbound/Outbound/P2P/Recovery/Maintenance** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Có sample INBOUND và INTERNAL; full OUTBOUND, P2P, PAYLOAD_RECOVERY, MAINTENANCE chưa chứng minh.
  - **Cần triển khai:** Định nghĩa từng Workflow published version với tasks/steps chính xác; xây happy/exception scenarios, compensation, warehouse contract và regression.
  - **DoD / Acceptance:** Mỗi workflow chạy từ TR→Job/Step→handover→Detail/TR/Stock (hoặc maintenance completion) với chứng cứ test.
  - **Phụ thuộc / cùng slice:** `WH-01, WH-05, FL-06, RB-08`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/park-and-workflow-catalog`, chưa merge):** Thêm sample OUTBOUND, P2P, RETURN_TO_PARK, CHARGING, MAINTENANCE; publish được qua API; OUTBOUND và P2P chạy hết luồng trong unit test, P2P và recovery chạy trên robot mô phỏng (`test_recovery_and_park.py`). Còn thiếu: chưa chạy trên robot thật.

- [~] **WFX-04 — PAYLOAD_RECOVERY / RECOVERY_REQUIRED entry path** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Có guard không cho reassign khi Container ONBOARD, nhưng chưa có flow recovery xác nhận chuyển hàng.
  - **Cần triển khai:** Đưa Job vào RECOVERY_REQUIRED khi custody chưa xác nhận, issue + assignee, checkpoint và steps bàn giao từ robot lỗi sang robot thay thế.
  - **DoD / Acceptance:** Không có hai robot sở hữu cùng một Container; Staff xác nhận transfer vật lý trước khi Job resume/reassign.
  - **Phụ thuộc / cùng slice:** `FL-06, APP-CAP-06, RB-07`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/payload-recovery`, chưa merge):** Robot lỗi khi có hàng → RECOVERY_REQUIRED, thùng giữ ONBOARD, mở issue; robot B tới endpoint an toàn, người xác nhận chuyển hàng, cùng Job đi tiếp. Chạy qua Web và robot mô phỏng. Còn thiếu: màn hình App (APP-CAP-06), chưa thử vật lý.

#### Handover actor, timeout & staff ops

- [x] **WH-03 — Human task claiming, broadcast, confirm-all, reoffer** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Hiện bất kỳ actor phù hợp API có thể confirm WAITING step; chưa có ownership/claim/timeout.
  - **Cần triển khai:** Tạo claim lease theo staff/site, broadcast, assignment, scanning expected Container, confirm-all xử lý đa container, escalation/re-offer khi no-show.
  - **DoD / Acceptance:** Hai Staff tranh claim: chỉ một người thắng; unauthorized confirm bị chặn; timeout re-offer không làm Job giả hoàn thành.
  - **Phụ thuộc / cùng slice:** `APP-CAP-01, APP-OPS-02, SY-02`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/human-task-claims`, chưa merge):** Claim có hạn, conditional update (hai Staff tranh: một người thắng qua HTTP thật), người khác và nút robot nhận 409, Admin takeover có lý do và audit, hết hạn thì offer lại. Đã bấm thử trên Web.

- [x] **SY-02 — WAIT/HUMAN timeout và claimant reassignment** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** WAITING có thể kéo dài vô hạn; không thấy timeout bền vững và escalation.
  - **Cần triển khai:** Persist deadline/claimant, scheduler hoặc reconciliation job, phát notification để claim lại hoặc Admin điều phối; không tự confirm.
  - **DoD / Acceptance:** Timeout được xử lý dù service restart; tài nguyên/robot giữ occupancy có chủ ý; owner rõ, không kẹt vô hạn.
  - **Phụ thuộc / cùng slice:** `WH-03, WFX-01`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/human-task-claims`, chưa merge):** Deadline lưu cột trong DB (sống qua restart), quá hạn mở issue và báo một lần; không tự confirm, không nhả robot.

- [x] **APP-OPS-02 — Confirm All / batch multi-Container handover** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Chưa có xác nhận hàng loạt với atomic/partial semantics rõ.
  - **Cần triển khai:** Thiết kế request nhiều ContainerIDs và validate từng item; quyết định all-or-nothing hay partial-allowed, thao tác lặp phải idempotent.
  - **DoD / Acceptance:** Sai một Container không khiến Container khác bị chuyển trạng thái giả; UI hiện từng kết quả.
  - **Phụ thuộc / cùng slice:** `WH-03, WH-10`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/human-task-claims`, chưa merge):** `confirm-batch` cho phép thành công một phần, kết quả từng thùng, gửi lại không ghi hai lần; nút Confirm all trên Web. App chưa có nút riêng.

### D05 — Fleet Dispatch, Selection, Capacity & Multi-robot Assignment

#### Fleet backend / selection

- [~] **FL-03 — Per-robot capacity, payload & dimensions** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Chưa có model thực tế cho kg, số Container, footprint và tải RBT-001/RBT-002.
  - **Cần triển khai:** Định nghĩa capacity của Robot và physical container dimensions/weight, checks theo nhiệm vụ/trip; dùng footprint riêng khi reserve path.
  - **DoD / Acceptance:** Job/trip vượt tải không được giao; nhóm nhiều container được split thành chuyến/batch thích hợp.
  - **Phụ thuộc / cùng slice:** `WH-08, FL-01`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/robot-capacity`, chưa merge):** Tải, số thùng, kích thước theo robot; cân nặng thùng; tách chuyến theo tải; dispatch, resume, recovery từ chối robot quá tải, không override được. Còn thiếu: reservation theo footprint từng robot, chưa có số đo thật của RBT-001/002.

- [~] **FL-04 — One Job → N robot assignments/trips** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Engine chưa chứng minh nhiều assignments thực thi độc lập trong một Job.
  - **Cần triển khai:** Thiết kế RobotAssignment per task/trip với exclusive command authority, completion tracking và grouping; tránh hai robot cùng chiếm một Container.
  - **DoD / Acceptance:** Job chỉ completed khi tất cả required trips complete; failure một robot không hoàn tất giả phần còn lại.
  - **Phụ thuộc / cùng slice:** `WH-08, FL-03, FL-06`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/job-robot-assignments`, chưa merge):** Bảng `job_robot_assignments` có partial unique index: một Job một robot, một robot một Job, chặn ở DB. N chuyến = N Job. Theo quyết định: không có nhiều robot song song trong một Job.

- [~] **FL-06 — Offline/reassign/recovery ownership** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Offline abort/revoke có phần code; ONBOARD chặn reassign, nhưng thiếu closed-loop custody recovery.
  - **Cần triển khai:** Correlate incident, active command, occupancy/quarantine và physical Container custody; quyết định safe retry, same robot resume hoặc transfer có xác nhận.
  - **DoD / Acceptance:** Không release vùng robot đang chiếm khi mất mạng; không reassign Container ONBOARD trước khi recovery verified.
  - **Phụ thuộc / cùng slice:** `WFX-04, RB-07, FLT-01`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/payload-recovery`, chưa merge):** Robot im lặng quá ngưỡng: có hàng thì recovery, không hàng thì REASSIGNING; vùng giữ không bị nhả tự động; không reassign khi chưa xác nhận chuyển hàng. Còn thiếu: chưa thử vật lý.

- [x] **FL-07 — Job Queue priority, fairness, starvation** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Có queue/priority một phần, chưa có FIFO/fairness/aging/deadline policy rõ.
  - **Cần triển khai:** Định nghĩa priority, deadline, aging, blocking reason và queue processor; đảm bảo no duplicate provision và không chiếm robot mãi do unclaim human step.
  - **DoD / Acceptance:** High-priority có cơ chế ưu tiên rõ; low-priority không starvation; hệ thống giải thích vì sao Job chưa dispatch.
  - **Phụ thuộc / cùng slice:** `FL-01, WH-08`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/job-dispatch-queue`, chưa merge):** Queue với priority, aging, deadline, `BlockingReason`; chỉ nhận Job có người enqueue; không đói (test). Đã bấm thử trên Web.

- [~] **FL-08 — Return-to-park/charging/empty Container policy** `[P2]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Sau Job chưa có automatic return-to-park hoặc charging task orchestration đầy đủ.
  - **Cần triển khai:** Thiết kế policy destination khi idle theo occupancy, battery confidence, parking capacity; charging kết nối thủ công, không hứa auto-dock.
  - **DoD / Acceptance:** Robot idle chọn parking hợp lệ không chặn OUTBOUND; low battery không tiếp tục Job mới theo production policy.
  - **Phụ thuộc / cùng slice:** `HW-04, FL-05`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/park-and-workflow-catalog`, chưa merge):** Nút về đỗ và tới sạc (người xác nhận cắm sạc, không auto-dock); pin thấp vẫn đi sạc được, không nhận việc mới; tự về đỗ có nhưng tắt mặc định. Còn thiếu: chưa chạy trên robot thật.

- [x] **FLT-02 — Fleet command surface ngoài NAVIGATE** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Có NAVIGATE/CANCEL/EXTEND/RENEW/REVOKE và teleop riêng; localize/dock/charge/soft-stop tùy capability chưa đủ.
  - **Cần triển khai:** Lập command catalog với supported/unsupported; implement soft-stop có ACK và an toàn; không expose charge/dock nếu không có hardware.
  - **DoD / Acceptance:** Mỗi command có authorization, timeout, acknowledgment và UI capability, không tự hiện action không support.
  - **Phụ thuộc / cùng slice:** `RB-03, RB-09`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/robot-command-catalog-history`, chưa merge):** `commands/catalog` từng lệnh có quyền, timeout, kiểu ACK; LOCALIZE, DOCK, CHARGE không được offer; STOP không có kết quả sau 30 s báo UNKNOWN.

#### Fleet views / server–client DTOs

- [x] **WEB-FLEET-06 — releaseTrafficAfterClearance action wired** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** API client đã có nhưng chưa có caller; chưa rõ authorization và clearance verification.
  - **Cần triển khai:** Bổ sung UI kỹ thuật có warning/certificate of physical clearance, confirm two-step; backend check occupancy/scope/incident.
  - **DoD / Acceptance:** Không thể giải phóng vùng robot vẫn chiếm chỉ bằng click; thao tác được audit.
  - **Phụ thuộc / cùng slice:** `FL-06, RB-05`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/payload-recovery`, chưa merge):** Người thao tác lấy từ token; từ chối khi robot còn báo được pose, còn Job đang chạy hoặc đang navigate; UI hai bước, gõ mã robot, có audit. Robot im lặng thì dựa vào xác nhận của người.

- [x] **BOTH-01 — RobotActivity/current JobAssignment API** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Chưa có join robot→Job/Task/Container cho map/details.
  - **Cần triển khai:** Read model server lấy active assignment và current step, safety fields, latest command; expose stable DTO qua Fleet.
  - **DoD / Acceptance:** Một robot xuất hiện đúng Job hiện tại, không nhân đôi active assignment, invalidation sau handover/cancel.
  - **Phụ thuộc / cùng slice:** `FL-04, WEB-FLEET-01`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/job-robot-assignments`, chưa merge):** `/robots/activity` trả Job, step hiện tại, request, thùng, lệnh gần nhất; lọc theo scope. Web của Thắng (WEB-FLEET-01) cần nối vào.

- [x] **BOTH-02 — Robot state events + job history read API** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Lịch sử trạng thái robot đang mock, chưa có truy vấn timeline thật.
  - **Cần triển khai:** Persist/read robot status/mode/command transitions và past jobs theo time; paging và retention policy.
  - **DoD / Acceptance:** Web xem lịch sử theo timestamp và cross-link Job/command đúng; không bị nhiễu heartbeat từng giây.
  - **Phụ thuộc / cùng slice:** `SY-07, WEB-FLEET-02`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/robot-command-catalog-history`, chưa merge):** `robot_state_events` chỉ ghi khi status, kết nối, hold đổi; `state-history` gộp với lệnh, có phân trang; `job-history`; retention. UI của Thắng (WEB-FLEET-02) cần nối vào.

- [x] **BOTH-03 — DispatchDecision read DTO** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Decision data mock hoặc DbSet chưa ghi.
  - **Cần triển khai:** Stable read contract scores, eligibility reason, provenance, selected bot, correlationId và decision version; không leak secrets.
  - **DoD / Acceptance:** Candidate/decision history UI có bằng chứng từ Fleet, tương thích ngay cả khi policy đổi.
  - **Phụ thuộc / cùng slice:** `FLT-01, WEB-TR-03`.
  - **Evidence phần mềm (09/11/2026, nhánh `feature/job-robot-assignments`, chưa merge):** Không còn ghi SELECTED trước guard; thêm REFUSED; không ghi lặp NONE khi lý do không đổi.

### D06 — Navigation, Semantic Traffic, Map Assets & Facility UI

#### Traffic, route and map backend

- [~] **FL-05 — Dual-lane concurrent authority & single-zone waiting** `[P0 (2 robots)]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Traffic còn sequential fallback; reservation bán kính rộng làm conflict giả giữa hai lane ngược chiều, partial grants/wait points chưa PASS vật lý.
  - **Cần triển khai:** Dùng resources theo lane/segment và effective robot footprint, grant trước vùng single; hold current occupancy khi paused/offline; không reverse ở NO_STOP.
  - **DoD / Acceptance:** Hai robot đi ngược chiều ở lane tách biệt khi clearance đủ; tới single chỉ một robot qua, robot kia chờ trước stop line; no collision/deadlock.
  - **Phụ thuộc / cùng slice:** `HW-03, FL-03`.

#### Navigation quality & physical dual-robot

- [~] **HW-01 — Robot route/endpoint/safety readiness trên V004** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Rig và code có nhưng physical MOVE/endpoint chưa chứng minh đầy đủ; lane-edge, yaw, speed filter, keepout và obstacle handling từng có lỗi.
  - **Cần triển khai:** Sửa lane-center A*+heuristic theo baseline Claude, kiểm tra footprint 26×32cm, keep-out, endpoint yaw, zone speed v/omega chain, gate & stop; instrument `/plan`, AMCL, odom, cmd_vel, authority.
  - **DoD / Acceptance:** Offline route regression và real lab có logs: đúng ONE_WAY/tim lane, không chạm keepout, stop đúng, pose/yaw trong threshold đã thống nhất.
  - **Phụ thuộc / cùng slice:** `HW-02, FL-05`.

- [ ] **HW-03 — Dual-robot physical traffic E2E** `[P0 (2 robots)]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** RBT-002 mới dự kiến rộng 20–22cm, chưa có chứng cứ hai robot thật dùng chung map và traffic ACTIVE thành công.
  - **Cần triển khai:** Tạo robot identity/namespace riêng, map/fingerprint đồng bộ, footprint theo robot, test từng bot rồi hai lane, junction, blocked route, offline/quarantine và emergency stop access.
  - **DoD / Acceptance:** Chỉ claim physical PASS khi rosbag/log chứng minh parallel lane khi không conflict, single-resource sequential đúng, safe waiting và recovery khi lỗi.
  - **Phụ thuộc / cùng slice:** `FL-05, HW-01, FL-03`.

### D07 — Robot Edge, Safety, Battery & Deployment

#### Robot control, battery and health

- [~] **RB-03 — Remote Stop / Pause / Deactivate AUTO** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Có teleop/cancel nhưng chưa có đầy đủ command semantics, ACK/confirmed stopped và state transitions; UI không được tự báo stop thành công.
  - **Cần triển khai:** Định nghĩa StopRequested→Accepted/Rejected→StoppedVerified/Unknown, cancel Nav2, zero speed via robot gate, watchdog, state pause và dispatch lock. Deactivate AUTO không phải power-off.
  - **DoD / Acceptance:** Mất ACK/robot offline hiển thị Unknown, không false success; commanded stop phải có motion verification phù hợp.
  - **Phụ thuộc / cùng slice:** `WFX-03, WEB-FLEET-03`.

- [~] **RB-04 — Exclusive manual teleop lease** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Có teleop path nhưng phải audit single authority, dead-man, watchdog, takeover khỏi Nav2 và traffic.
  - **Cần triển khai:** Thiết kế request/grant/release lease per robot, controlled speed, hold-to-drive, local fail-safe timeout; require operator supervision và safety corridor.
  - **DoD / Acceptance:** Hai kỹ thuật viên không cùng điều khiển; nhả deadman/mất kết nối robot ngừng; AUTO không tranh cmd_vel với manual.
  - **Phụ thuộc / cùng slice:** `RB-01, RB-03`.

- [ ] **RB-09 — Robot reboot/shutdown/deactivate/remote power-on capability** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Chưa có feature power management rõ; nguồn ngắt không tự bật lại qua MQTT thông thường.
  - **Cần triển khai:** Tách service restart/reboot Pi, firmware reset, shutdown, disable dispatch; Power-on từ trạng thái mất điện phải có hardware power controller riêng nếu muốn.
  - **DoD / Acceptance:** Mỗi action chỉ hiện khi support, có xác thực và safe-state; không quảng cáo remote power-on chưa có mạch.
  - **Phụ thuộc / cùng slice:** `FLT-02, RB-08`.

- [~] **RB-10 — Technical diagnostics CPU/sensors/TF/Nav2/motor** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Pi/ROS có dữ liệu rời rạc; chưa có aggregated technical health contract, nhiều chỉ số chưa đo.
  - **Cần triển khai:** Aggregate diagnostics LiDAR, encoder, IMU, ultrasonic, TF/localization, costmap, Nav2 lifecycle, motor communication, Pi CPU/temp/memory nếu thật có sensor; stale markers.
  - **DoD / Acceptance:** Fault/delay gây degraded/unknown đúng, Technician không nhìn thấy giá trị dựng; event có timestamp.
  - **Phụ thuộc / cùng slice:** `RB-02, RB-06`.

- [~] **HW-02 — TR→MOVE→HUMAN button→Warehouse E2E vật lý** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Protocol MQTT command/ACK/RESULT và interaction_request/confirm wire ở code; button GPIO end-to-end và stock write-back chưa PASS.
  - **Cần triển khai:** Lab với RBT-001: start TR/Job, navigate, observe ACK/RESULT, staff/robot button confirm đúng Container, verify DB JobStep/Detail/TR và stock/location cùng command IDs.
  - **DoD / Acceptance:** Chỉ đánh dấu x khi có log/DB/bag từ physical lab; click Staff API không chứng minh GPIO button path.
  - **Phụ thuộc / cùng slice:** `WH-01, WH-03, HW-01`.

- [~] **HW-05 — Ultrasonic / IMU / EKF enhancements** `[P2]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Cảm biến có trong bill-of-material nhưng mức integration/validation chưa đủ.
  - **Cần triển khai:** Audit physical wiring, ROS topics, TF, noise, state estimator calibration; enable sensor fusion từng bước có benchmark, không tune đồng loạt trước baseline.
  - **DoD / Acceptance:** Logs cho thấy dữ liệu sensor timely và localization cải thiện; nếu không đạt thì giữ disabled và nêu rõ.
  - **Phụ thuộc / cùng slice:** `RB-10, HW-01`.

- [~] **HW-06 — Reproducible Pi deploy, startup, rollback** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Có scripts/bringup nhưng startup/systemd, version pinning và rollback chưa chứng minh toàn diện.
  - **Cần triển khai:** Ghi commit/tag, map fingerprint, ROS config, firmware version, health/readiness gate, startup/shutdown và known-good rollback steps.
  - **DoD / Acceptance:** RBT-001/RBT-002 bringup lặp lại được, không dùng nhầm map, rollback dưới hướng dẫn bảo tồn dữ liệu/authority.
  - **Phụ thuộc / cùng slice:** `HW-01, HW-03`.

### D08 — Technician, Fault Catalog, Issue / Incident & Recovery

#### Technical dashboard, escalation and maintenance

- [ ] **RB-05 — Technician two-level intervention** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Chưa có workflow Level1 remote/Level2 supervised physical đầy đủ.
  - **Cần triển khai:** Thiết kế state machine detect fault→out of service→remote diagnose/stop→manual takeover if safe→recovery/maintenance→verification→return; trace actor, reason.
  - **DoD / Acceptance:** Không có auto dispatch trong maintenance; manual chỉ khi authority; trạng thái robot/cargo/traffic sau recovery được reconcile.
  - **Phụ thuộc / cùng slice:** `RB-01, RB-04, RB-08`.

- [ ] **RB-06 — Fault code catalog / diagnostics lifecycle** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Robot/System error code và root cause chưa thống nhất; UI chủ yếu hiện generic failed.
  - **Cần triển khai:** Catalog phân loại `SYS_*`, `ROB_*`, `OPS_*`: severity, cause, retryability, owner, suggested action, correlationIds, localization/motion state; map Nav2/MQTT error code.
  - **DoD / Acceptance:** Một navigation abort không còn bị ghi nhầm traffic wait; incident hiển thị actionable reason và log trace.
  - **Phụ thuộc / cùng slice:** `SY-01, SY-08, RB-07`.

### D09 — Observability, Audit, Notifications & Historical Read Models

#### System trace / error surfaces / operations logging

- [~] **SY-03 — End-to-end causal trace TR→Robot** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Có các ID riêng lẻ nhưng chưa có một đường trace xuyên TR/Detail/Batch/Job/Step/Command/MQTT/Robot event.
  - **Cần triển khai:** Chuẩn hóa correlationId/requestId/commandId + references qua DB, logs, notifications; expose timeline API và error origins.
  - **DoD / Acceptance:** Từ TR tìm được robot command/ACK/RESULT, từ fault tìm về Step/Container, không có orphan row mất liên kết.
  - **Phụ thuộc / cùng slice:** `RB-06, OPS-02`.

- [~] **SY-07 — Fleet history real read models** `[P2]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Web fleet detail dùng mock, chưa có persistent robot job/state history được query đúng.
  - **Cần triển khai:** Bổ sung state transition log/latest activity read-model, retention và paging, tránh write tất cả telemetry vô hạn.
  - **DoD / Acceptance:** View robot recent jobs/state changes gắn log có timestamp/command, production không đọc mock.
  - **Phụ thuộc / cùng slice:** `BOTH-02, WEB-FLEET-02`.

- [ ] **BOTH-05 — HandoverConfirmation confirmedByName join** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Confirmation lưu ID/metadata nhưng FE chưa có tên nhân viên từ Identity join.
  - **Cần triển khai:** Provide server read projection with confirmation actor id/display name/source/time và privacy-safe cache; robot-button không giả actor Staff.
  - **DoD / Acceptance:** History hiển thị đúng user đã confirm, robot button hiển thị nguồn Robot và không gán nhầm tên.
  - **Phụ thuộc / cùng slice:** `WH-03, SY-03`.

### D10 — Infrastructure, Command Delivery, Offline & Resilience

#### Command lifecycle & event durability

- [~] **SY-01 — Command lifecycle ACK/RESULT/timeout reconciliation** `[P0]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** MQTT command lifecycle có, nhưng audit từng có retry planner abort như traffic wait; lost RESULT/EXTEND có thể làm executing treo.
  - **Cần triển khai:** Phân loại Nav2 planner vs traffic errors, ACK timeout và result timeout; bounded retry chỉ với transient, idempotent commandId, orphan reconciliation và cancellation cleanup.
  - **DoD / Acceptance:** Không có Job/Command stuck forever; late RESULT không advance step mới; planner failure báo code đúng.
  - **Phụ thuộc / cùng slice:** `RB-06, SY-03`.

- [ ] **SY-06 — Transactional outbox/inbox + dedup** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Event sau DB commit có thể mất khi process crash, khiến Warehouse/Operations không sync.
  - **Cần triển khai:** Outbox lưu event cùng DB transaction, background publisher retry; inbox/consumer dedup theo eventId/aggregateVersion, eventual reconciliation.
  - **DoD / Acceptance:** Crash ngay sau DB commit không mất stock/notification event; replay MQTT không double-post warehouse.
  - **Phụ thuộc / cùng slice:** `WH-01, EVT-01`.

- [ ] **EVT-01 — Outbox implementation task (alias SY-06)** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** Đã nằm trong SY-06, không phải feature hoàn toàn độc lập để tính tiến độ gấp đôi.
  - **Cần triển khai:** Implement schema/migration, dispatcher, retry/idempotent consumer và monitoring theo design SY-06; dùng cùng acceptance test.
  - **DoD / Acceptance:** Dựa vào DoD của SY-06, không nhận done riêng trước khi crash test.
  - **Phụ thuộc / cùng slice:** `SY-06 (same delivery slice)`.

- [~] **APP-OPS-03 — Offline synchronization / request queue** `[P2]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** App hiển thị offline Unavailable; không queue/sync các lệnh.
  - **Cần triển khai:** Chọn rõ offline read-only cho thao tác nguy hiểm; nếu cần outbox client thì chỉ cho draft/request idempotent, không queue stop, cancel, handover confirm mù.
  - **DoD / Acceptance:** Không tạo thao tác giả đã gửi; khi reconnect draft đồng bộ hoặc yêu cầu user xác nhận lại, chống duplicate.
  - **Phụ thuộc / cùng slice:** `SY-06, WH-03`.

- [~] **WEB-MGMT-03 — Dev-only mock auto-login isolation** `[P1]`
  - **Owner:** Nguyễn Quốc Khải.
  - **Hiện trạng (theo audit):** `VITE_MOCK_AUTO_LOGIN` path tồn tại để dev; cần bảo đảm không thể bật nhầm production.
  - **Cần triển khai:** Build-time env validation, CI guard, prominent dev indicator, backend vẫn auth required; strip mock tokens in production bundle.
  - **DoD / Acceptance:** Production build fail nếu mock auth bật; unauthenticated API không truy cập được.
  - **Phụ thuộc / cùng slice:** `POL-01..03`.

---

## Quy tắc nghiệm thu chung
- **Code/UI:** API, database, permission, Web/App và integration chạy bằng contract thật; không mock trong production path.
- **Warehouse & Transport:** Container identity/custody, JobContainer, Detail/TR, `Container.location` và `InventoryStock` khớp sau handover; retry không double-post.
- **Robot & Traffic:** MQTT ACK/RESULT, authority gate, stop/watchdog và reservation có kiểm thử. Bằng chứng Gazebo/rig không thay thế bằng chứng chạy robot thật.
- **Security/Technician:** quyền server-side, session/manual lease có dead-man và đường xử lý lỗi rõ ràng; không coi software remote stop là hardware E-stop.
- **Tiến độ:** chỉ cập nhật `% Complete` tại `MasterPlan` sau khi có evidence hợp lệ; trạng thái checklist được cập nhật độc lập.

## Ghi chú về alias / phần việc liên quan
- `WH-04` và `TRN-01/02/03`: TR lifecycle và các API thành phần.
- `WH-05` và `WFX-01/02`: feature CHECK/WAIT và các executor liên quan.
- `WH-01`, `WHM-03/04` và `BOTH-10`: cùng một chuỗi đảm bảo Warehouse truth, triển khai ở các lớp khác nhau.
- `SY-06` và `EVT-01`: cùng transactional outbox/inbox, chỉ theo dõi để không bỏ sót implementation.
- `RB-01`, `IDN-04`, `BOTH-07`: domain role/permissions và quyền hiển thị trên client.

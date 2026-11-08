# Audit log, thông báo theo người dùng và IssueReport (Phase 2)

> Task: **SY-05, OPS-02, OPS-03, SY-04, OPS-01, WFX-05** · Owner: Nguyễn Trung Nguyên · Nhánh: `feature/nguyen-p2-audit-issue` (nối tiếp Phase 1)

## 1. Vấn đề trước khi làm

- **Audit:** Mongo đã có schema `audit_logs` và `issue_reports` nhưng **không có code nào ghi hay đọc**. Thao tác quan trọng (đổi role, reset mật khẩu, publish map, huỷ Job, gửi lệnh robot) không để lại lịch sử ai làm, lúc nào.
- **Thông báo dùng chung một hộp:**
  - Mọi thông báo đều có người nhận là `Guid.Empty`, tức một hộp chung cho mọi Admin.
  - Admin A đọc một thông báo thì Admin B cũng thấy là "đã đọc".
  - Staff và Technician không có hộp thư nào.
- **Báo sự cố trên app bị khoá:** nút báo sự cố bị tắt, vì app gọi `/tasks/{id}/report-problem` mà endpoint này không tồn tại.
- **Bước HUMAN chỉ xác nhận suông:** `REPORT_ISSUE` hoàn thành step nhưng không tạo ra issue nào.

## 2. Audit log (SY-05, OPS-02)

```
Endpoint .Audited("map.published","MAP")  ─┐
Handler  audit.RecordAsync(before/after)   ─┼─► IAuditTrail (BuildingBlocks) ─► MongoAuditTrail ─► audit_logs
Integration event (container custody)      ─┘        actor, role, IP, user-agent, traceId, TTL
```

- **`IAuditTrail` (BuildingBlocks)** là interface mọi module dùng để ghi audit. Operations cài đặt nó bằng `MongoAuditTrail`.
  - Bộ ghi tự lấy người thực hiện (id, username, role), IP, User-Agent và `CorrelationId` (trace id của request).
  - **Ghi audit lỗi thì không làm hỏng thao tác chính:** lỗi chỉ được ghi log cảnh báo, không ném exception ra ngoài.
- **Không ghi dữ liệu bí mật:** `AuditRedaction` bỏ mọi khoá có chứa `password`, `token`, `hash`, `secret`, `credential`. Filter cấp endpoint cũng không ghi body request, vì body có thể chứa mật khẩu tạm.
- **Ba cách ghi audit:**
  1. **`.Audited(action, entityType, routeValue)` trên endpoint.** Chỉ ghi khi endpoint trả mã 2xx. Id của entity lấy từ route; với thao tác tạo mới thì lấy `id` (hoặc `account.id`) trong body trả về. Đã gắn cho 30 endpoint:
     - map: create / update / import / clone / publish / archive, xoá endpoint / edge / zone;
     - TR: create / queue;
     - Job: start / resume / cancel, confirm step;
     - Workflow: publish / delete;
     - robot: register / đổi map / enable / disable / put-in-service / stop / navigate;
     - traffic: reconcile / release;
     - container: create;
     - status của product và vị trí lưu kho;
     - account: create / reset password.
  2. **Ghi thẳng trong handler, có before/after.** Dùng cho:
     - `account.role_changed` (hoặc `account.updated`);
     - `account.status_changed`;
     - `account.password_changed` và `account.password_change_failed`;
     - `account.robot_scope_set`;
     - mọi thao tác trên issue.
  3. **Từ integration event:** `container.custody_changed` (ASSIGNED / ONBOARD / DELIVERED / FAILED / CANCELLED), ghi trong `AuditEventRecorder` ở Host.
     - Hiện chưa có code nào ghi trực tiếp vào `InventoryStock` (phần của Thắng). Khi có thì chỉ cần thêm một handler tương tự.
- **Đọc audit:** `GET /api/operations/audit-logs?actorId&entityType&entityId&action&from&to&skip&take`, cần quyền `audit.read`.
  - `action` lọc theo **tiền tố**, ví dụ `account.` trả về mọi thay đổi tài khoản.
  - **Technician** chỉ thấy audit về robot trong phạm vi của mình và hành động của chính mình.
- **Thời hạn lưu:** mỗi bản ghi có `ExpireAt` (kiểu date của BSON), cùng một TTL index. Số ngày cấu hình bằng `Operations:Audit:RetentionDays`, mặc định 365.
  - `OccurredAt` cũng được lưu dạng date của BSON để lọc và sắp xếp được. `DateTimeOffset` mà Mongo lưu thành mảng thì không lọc theo thời gian được.
- **Web:** trang **Operations → Audit log**, lọc theo tiền tố action và loại entity, hiển thị phần thay đổi before → after.

## 3. Thông báo theo người dùng (OPS-03, SY-04)

- **Người nhận:** `NotificationDraft` có thêm `Audience`. Mặc định là `Admins`; các audience khác gồm:

  | Audience | Ai nhận | Dùng khi |
  |---|---|---|
  | `Admins` | ADMIN | Job lỗi, TR lỗi |
  | `Floor` | ADMIN, STAFF | `JOB_STEP_WAITING_FOR_PERSON` (cần người ở sàn kho xác nhận) |
  | `RobotCare(robotId)` | ADMIN, cùng TECHNICIAN **được gán robot đó** | robot offline, timeout / từ chối lệnh, pin yếu, lỗi robot, issue về robot |
  | `Person(accountId)` | đúng một người | `ISSUE_ASSIGNED`, `ISSUE_RESOLVED` |

- **Đã đọc tính riêng cho từng người:** mảng `Reads[{accountId, readAt}]` nằm ngay trong document.
  - Đánh dấu đã đọc là thao tác `$push` có điều kiện "chưa có mình trong mảng", nên nguyên tử.
  - Document cũ có `IsRead = true` vẫn được coi là đã đọc với mọi người; document cũ không có `RecipientRoles` được hiểu là gửi cho ADMIN.
- **Hộp thư:** `GET /api/operations/notifications` chỉ trả thông báo gửi cho chính người gọi, hoặc cho role của người đó.
  - Technician chỉ thấy thông báo robot của robot trong phạm vi.
  - Đánh dấu đã đọc một thông báo không phải của mình thì trả 404.
- **Quyền:** STAFF và TECHNICIAN được thêm quyền `notification.read`.
- **Link mở đúng màn hình (SY-04):**
  - Mỗi thông báo có `route`, ví dụ `/monitor/jobs/{id}`, `/monitor/requests?requestId=`, `/monitor/fleet?robotId=`, `/operations/issues/{id}`.
  - Web ưu tiên dùng `route`, rồi mới tự suy ra từ loại entity.
- **SignalR:** event `notificationCreated` được gửi tới group `user:{id}` hoặc `role:{ROLE}`. Với Technician, thông báo robot đi qua group `robot:{id}`, nên chỉ người được gán robot đó nhận được.
  - App trước đây nghe event `notificationReceived` mà backend không gửi; nay app đã chuyển sang nghe `notificationCreated`.

## 4. IssueReport (OPS-01)

```
OPEN ─► ACKNOWLEDGED ─► IN_PROGRESS ─► RESOLVED ─► CLOSED
  │            │              ▲             │
  └────────────┴──────────────┴── RESOLVED ─┘ (mở lại → IN_PROGRESS)     mọi trạng thái (trừ CLOSED) → CLOSED
```

| Method | Route | Quyền |
|---|---|---|
| POST | `/api/operations/issues` | `issue.create` (ADMIN, STAFF, TECHNICIAN) |
| GET | `/api/operations/issues?status&issueType&severity&assigneeId&jobId&robotId&mine` | `issue.read` |
| GET | `/api/operations/issues/{id}` | `issue.read` |
| POST | `/issues/{id}/assign` `{assigneeId, expectedVersion}` | `issue.manage` |
| POST | `/issues/{id}/transition` `{status, expectedVersion, resolution?}` | `issue.manage` |
| POST | `/issues/{id}/evidence` `{evidence, expectedVersion}` | `issue.create` |

- **Ai xem được issue nào:**
  - Admin xem tất cả.
  - Technician xem issue mình báo, issue được giao cho mình, và issue về robot trong phạm vi.
  - Staff xem issue mình báo và issue được giao cho mình.
  - Issue nằm ngoài các nhóm trên trả **404**, để không lộ việc issue đó tồn tại.
- **Chống ghi đè đồng thời:** issue có trường `Version`. Mọi thay đổi phải gửi kèm `expectedVersion`; lệch version thì trả `409 issue_version_conflict`. Việc cập nhật dùng `FindOneAndUpdate` lọc theo cả `{Id, Version}`.
- **Kiểm tra dữ liệu:**
  - Issue loại ROBOT phải có `robotId`.
  - Chuyển sang RESOLVED phải có `resolution`.
  - Bằng chứng tối đa 10 mục khi tạo; mỗi mục thuộc loại PHOTO, VIDEO, NOTE, LINK hoặc FILE và phải có URI hoặc ghi chú.
  - Chỉ lưu metadata của bằng chứng, file thật nằm ở nơi khác.
- **Thông báo:**
  - Tạo issue: gửi `ISSUE_REPORTED` (mức ALERT nếu severity từ HIGH trở lên).
  - Giao issue: gửi `ISSUE_ASSIGNED` cho người được giao.
  - Resolve: gửi `ISSUE_RESOLVED` cho người báo. Resolve hoặc close sẽ đánh dấu xử lý xong thông báo `issue:{id}:open`.
- **Web:** trang **Operations → Issues** gồm danh sách lọc theo trạng thái và khung chi tiết, có nút giao cho mình và các nút chuyển trạng thái theo `allowedTransitions` server trả về.
- **App:** nút báo sự cố đã bật. Mỗi loại sự cố của Staff được đổi sang loại issue và mức độ tương ứng, rồi gửi `POST /api/operations/issues`, kèm `jobId` và `jobStepId`.

## 5. Bước REPORT_ISSUE trong workflow (WFX-05)

- **Không phụ thuộc trực tiếp vào Operations:** WorkflowExecution gọi `IIssueReporter` (BuildingBlocks), Operations cài đặt interface này.
- **Trình tự trong `ConfirmHumanStepAsync`:**
  - Với `REPORT_ISSUE`, engine **mở issue trước**, rồi mới đánh dấu step COMPLETED.
  - Mở issue lỗi thì exception được trả về cho người gọi và step vẫn **WAITING**.
  - Mô tả issue lấy từ `note` lúc xác nhận; không có note thì dùng câu mặc định.
- **Idempotent:** issue lưu `SourceKey = "step:{jobStepId}"`, có unique index một phần. Xác nhận lại cùng step, hoặc hai lần xác nhận chạy đua nhau, đều trả về cùng một issue.
- **Kết quả:** `issueId` được ghi vào `OutputValues` của step.
- **`MAINTENANCE_CONFIRM`** vẫn chỉ là xác nhận, nhưng giờ có audit `job_step.confirmed`. Quy trình bảo trì thật thuộc RB-08 ở Phase 3.

## 6. Kiểm thử

| Loại | Nội dung | Kết quả |
|---|---|---|
| Unit | `AuditRedactionTests`, `IssueLifecycleTests` (luật chuyển trạng thái, route thông báo), 2 test engine cho `REPORT_ISSUE` (mở đúng một issue; tạo issue lỗi thì step vẫn WAITING) | toàn bộ 628 qua (3 skip có sẵn) |
| Integration | `CreateIssueReportIntegrationTests` (Staff tạo issue → 201 và lưu vào Mongo; Staff khác không xem được; vòng đời có kiểm tra version / transition / resolution; giao việc thì chỉ người được giao nhận thông báo; bước workflow mở tối đa một issue); `AuditLogEndpointTests` (đổi role có before/after và người thực hiện, không lộ mật khẩu tạm; Staff bị 403; Technician chỉ thấy hành động của mình; đã đọc riêng từng người; thông báo chỉ tới đúng audience) | test Operations và Identity 120/120 qua; toàn bộ suite: xem log của lần chạy |
| Web | typecheck, lint, vitest | sạch, 25/25 |
| App | `api-contracts` (báo sự cố gọi `/api/operations/issues`), các test cũ | 111/111 |
| Smoke trên dev | Staff tạo `ISS-…` → Admin nhận `ISSUE_REPORTED` kèm route → đóng issue (version 1 → 2) → audit ghi `issue.reported` (staff) và `issue.status_changed` (admin) | đạt |

## 7. Hạn chế và việc tiếp theo

- **Người được giao issue:** chưa kiểm tra `assigneeId` có phải account thật không. Identity và Operations là hai module tách nhau; nếu cần thì thêm một contract để Operations tra danh sách account.
- **Bằng chứng (evidence):** mới lưu URI. Upload file (ảnh) cần một kho lưu tài sản riêng, chưa làm.
- **Hộp thư cũ:** các thông báo trước Phase 2 vẫn tính là chưa đọc với từng Admin (trên dev đang là 87), trừ khi đã được đánh dấu đọc theo cách cũ. Bấm "Đọc tất cả" một lần là xong.
- **Màn app:** các màn hộp thư trên app (APP-OPS-04) do Đạt phụ trách. Backend và event realtime cho phần này đã sẵn sàng.

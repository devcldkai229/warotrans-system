# Phân quyền, Technician và vòng đời mật khẩu (Phase 1)

> Bao gồm các task: **IDN-01, IDN-02, IDN-03, IDN-04, RB-01, POL-01, POL-04, BOTH-07, RTM-01**.
> Owner: Nguyễn Trung Nguyên · Nhánh: `feature/nguyen-p1-security`

## 1. Vấn đề trước khi làm

- **Role:** backend chỉ có hai role `ADMIN` và `STAFF`. Endpoint dùng `AdminOnly` / `StaffOrAdmin`, hoặc không khai báo gì và rơi vào *fallback* "chỉ cần đăng nhập".
- **Navigation:** mọi API ghi (tạo / sửa / xoá / publish map, endpoint, edge, zone) **không có kiểm tra role**. Một tài khoản STAFF gọi thẳng bằng curl là publish được map.
- **Fleet:** teleop, gửi lệnh navigate, enable / disable robot cũng không có kiểm tra role.
- **Mật khẩu:** không có đổi mật khẩu, không có reset, cũng không có cơ chế buộc đổi mật khẩu tạm.
- **Đọc account:** `POST /accounts` trả header `Location` trỏ tới `/accounts/{id}`, nhưng route đó không tồn tại.
- **File map:** `/map-assets` được phục vụ *trước* bước xác thực, nên ai trong mạng LAN cũng tải được bản đồ kho.
- **SignalR:** hub không có `[Authorize]`. Telemetry robot và trạng thái Job được gửi cho **mọi** kết nối.

## 2. Mô hình mới

### 2.1 Permission thay cho role

```
Role (trong JWT) ──► RolePermissionMatrix (code) ──► permission  ──► policy "perm:<tên>" trên endpoint
                                     │
                                     └─► GET /api/identity/me/capabilities  (Web / App vẽ UI từ đây)
```

- **Danh sách quyền** nằm ở `BuildingBlocks/Authorization/Permissions.cs`. Mỗi quyền có dạng `resource.action`, ví dụ `robot.stop`, `robot.manual.drive`, `map.write`, `tr.create`, `user.manage`.
- **Ai có quyền gì** chỉ quyết định ở **một chỗ**: `RolePermissionMatrix.cs`.
  - Matrix được review qua PR và có unit test (`RolePermissionMatrixTests`).
  - Nguyên tắc là **deny by default**: role không biết thì không có quyền nào.
- **Endpoint** khai báo `.RequirePermission(Permissions.X)`. `PermissionAuthorizationHandler` hỏi `user.IsInRole(role)` cho từng role đã biết, nên chạy được với claim `role` của JWT lẫn claim type của scheme test.
- **Permission không được nhét vào token.** Lý do:
  - Quyền suy ra từ role, mà đổi role thì backend đã revoke mọi phiên của account đó.
  - Token vì vậy nhỏ gọn.
  - Đổi matrix trong code có hiệu lực ngay sau khi deploy, không phải chờ token cũ hết hạn.

| Quyền (rút gọn) | ADMIN | STAFF | TECHNICIAN |
|---|:-:|:-:|:-:|
| `user.manage` (tài khoản, reset mật khẩu, gán robot) | ✔ | | |
| `console.access` (vào web console) | ✔ | | ✔ |
| `map.read` / `map.write` | ✔ / ✔ | ✔ / – | ✔ / – |
| `warehouse.read` / `warehouse.write` / `container.create` | ✔ ✔ ✔ | ✔ – ✔ | ✔ – – |
| `voucher.write` (lập, sửa, xác nhận, hủy phiếu nhập/xuất) | ✔ | ✔ | – |
| `container.recover` (khai báo vị trí thùng đang IN_TRANSIT hoặc HOLD) | ✔ | ✔ | – |
| `tr.read` / `tr.create` | ✔ ✔ | ✔ ✔ | ✔ – |
| `job.read` / `job.operate` / `job.pause` / `job.cancel` | ✔ ✔ ✔ ✔ | ✔ ✔ ✔ – | ✔ – ✔ – |
| `job.takeover` (giành bước đang có người giữ, bắt buộc lý do) | ✔ | – | – |
| `robot.read`, `robot.stop` | ✔ | ✔ | ✔ (theo scope) |
| `robot.configure`, `robot.command`, `robot.manual.drive`, `robot.maintenance`, `robot.power`, `robot.diagnostics` | ✔ | | ✔ (theo scope) |
| `robot.manage` (đăng ký robot, đổi map), `dispatch.override` | ✔ | | |
| `traffic.read` / `traffic.manage` | ✔ | | ✔ |
| `notification.read`, `statistics.read` | ✔ | | |
| `issue.*`, `audit.read` | ✔ | issue.read / issue.create | ✔ |

Một số điểm cần chú ý trong matrix:
- **STAFF được `robot.stop` nhưng không được lái robot.** Dừng robot là quyền an toàn, nhưng nút Fleet Recall trên app vẫn dùng lệnh CANCEL.
- **TECHNICIAN** không cấp được role, không sửa được tồn kho, không tạo được TR và không soạn được map.
- **Các quyền đã khai báo nhưng chưa có endpoint dùng:** `robot.power`, `robot.maintenance`, `issue.*`, `audit.read`, `job.pause`. Chúng được giữ chỗ trước để Phase 2–3 dùng lại.

### 2.2 Technician và phạm vi robot (RB-01)

- **Lưu trữ:** bảng `identity.technician_robot_scopes(account_id, robot_id, assigned_at, assigned_by)`.
  - Identity chỉ lưu `robot_id`, không tham chiếu sang bảng của Fleet, để giữ ranh giới module.
- **`IRobotAccessScope`** (BuildingBlocks), do Identity cài đặt:
  - Role khác Technician thì thấy toàn bộ fleet.
  - Technician chỉ thấy các robot đã được gán.
  - Technician **chưa được gán robot nào thì không thấy robot nào** (deny by default).
- **Endpoint có robot trong route** dùng thêm `.RequireRobotScope()`. Robot nằm ngoài scope thì trả `403 robot_out_of_scope`.
  - Áp dụng cho: GetRobot, camera, enable / disable / put-in-service, navigate, cancel, teleop, reconcile traffic.
- **`GET /api/fleet/robots`** lọc danh sách theo scope.
- **Admin gán robot** qua `GET/PUT /api/identity/accounts/{id}/robot-scope`, hoặc nút **Robots** trong Quản lý tài khoản trên web. Chỉ account TECHNICIAN mới có scope; account khác trả `409 robot_scope_requires_technician`.
- Khi một account **thôi là Technician**, scope của nó bị xoá để không "sống lại" khi account được đổi role ngược lại sau này.

### 2.3 Vòng đời mật khẩu (IDN-01, IDN-02)

```
Admin tạo account / Reset ─► mật khẩu tạm (hiện 1 lần, no-store) + MustChangePassword = true
           │
           ▼
Đăng nhập ─► access token có claim pwd_change=true
           │   └─ PasswordChangeGate: chỉ mở /me, /me/capabilities, /me/change-password, /logout
           │      mọi API khác → 403 password_change_required (kể cả kết nối hub)
           ▼
POST /api/identity/me/change-password {currentPassword, newPassword, useCookie}
           ├─ sai mật khẩu hiện tại → 400 current_password_incorrect
           ├─ chính sách: ≥10 ký tự, có chữ và số, không có khoảng trắng đầu/cuối, không chứa username
           └─ thành công: revoke MỌI phiên cũ, trả phiên mới (không còn pwd_change)
```

- **Reset của Admin:** `POST /api/identity/accounts/{id}/reset-password` (`user.manage`).
  - Admin không reset được mật khẩu của chính mình (`cannot_reset_own_password`); với account của mình thì dùng đổi mật khẩu.
  - Reset sẽ revoke mọi phiên của người bị reset.
- **Tách khỏi luồng đổi mật khẩu thường:** reset không có "token reset" gửi qua email. Admin đưa mật khẩu tạm trực tiếp cho người dùng, và người đó bắt buộc phải đổi ở lần đăng nhập kế tiếp.
- **Các account có sẵn:** migration đặt `must_change_password = false`, nên không ai bị khoá khi deploy.
- **Ghi log:** mỗi thao tác đều ghi log có `AccountId` và người thực hiện. **Audit log có cấu trúc thuộc Phase 2** (SY-05 / OPS-02).

### 2.4 Endpoint mới của Identity

| Method | Route | Quyền |
|---|---|---|
| GET | `/api/identity/me/capabilities` | đã đăng nhập (mở cả khi đang dùng mật khẩu tạm) |
| POST | `/api/identity/me/change-password` | đã đăng nhập (mở cả khi đang dùng mật khẩu tạm) |
| GET | `/api/identity/accounts/{id}` | `user.manage` (IDN-03) |
| POST | `/api/identity/accounts/{id}/reset-password` | `user.manage` |
| GET / PUT | `/api/identity/accounts/{id}/robot-scope` | `user.manage` |

Ở môi trường Development, seeder tạo thêm tài khoản `technician` / `Technician@123`.

### 2.5 File bản đồ (POL-04)

Quyết định: **mọi file trong `/map-assets` đều cần đăng nhập và quyền `map.read`.**

- Ảnh `map-preview.png` chỉ là PGM chiếm chỗ được tô màu, chứa cùng thông tin bố trí kho như `map.pgm`. Vì vậy không có lý do để ảnh preview là public còn PGM thì không.
- **Phân quyền ngay trong pipeline:** middleware kiểm tra người dùng nằm *sau* `UseAuthentication` và *trước* `UseStaticFiles`. Không có token thì trả 401; có token nhưng thiếu quyền thì trả 403.
- **Cache:** response có `Cache-Control: private, max-age=300`, để không bị cache ở proxy dùng chung.
- **Cách client gửi token:** thẻ `<img>` không gửi được header, nên Web / App gắn `?access_token=` (cùng cách camera MJPEG và SignalR đang làm). Script `sync_web_map.py` và các công cụ khác gửi header `Authorization: Bearer`.
- **S3:** khi chạy chế độ S3 với URL public thì backend không kiểm soát được việc truy cập. Muốn dùng production với S3, bucket phải private và backend phải cấp presigned URL. Việc này ghi lại làm hạn chế đã biết, chưa làm.

### 2.6 SignalR (RTM-01)

- **Kết nối:** hub `/hubs/notifications` có `[Authorize]`.
  - Kết nối bằng token mật khẩu tạm sẽ bị huỷ ngay.
  - `CloseOnAuthenticationExpiration = true`: token hết hạn thì server đóng kết nối, và client nối lại bằng token mới. Nhờ đó role và scope được đánh giá lại ít nhất mỗi vòng đời token.
- **Group được gán lúc kết nối** (`RealtimeGroups`):
  - `user:{id}` (dành cho thông báo theo người dùng ở Phase 2)
  - `perm:job.read` cho `jobUpdated`
  - `perm:notification.read` cho `notificationCreated`
  - `robots:all` cho người thấy cả fleet, hoặc `robot:{id}` cho từng robot trong scope của Technician
- **Phía gửi:** không còn producer nào dùng `Clients.All`. Telemetry và connectivity của robot được gửi tới `robots:all` cùng `robot:{id}`.
- **Phía client:**
  - **Web:** `accessTokenFactory` refresh token nếu còn dưới 30 giây. Khi server đóng kết nối, client tự `start` lại trong lúc trang vẫn đang lắng nghe.
  - **App:** dùng `getFreshAccessToken()`, và vòng retry 10 giây có sẵn sẽ kết nối lại.

## 3. Web và App (BOTH-07)

- **Nguồn quyền:** cả hai client gọi `GET /me/capabilities` sau khi đăng nhập hoặc khôi phục phiên, rồi **vẽ UI theo `permissions`**, không theo tên role.
  - Web dùng `useAuth().can(...)` và `canActOnRobot(...)`.
  - App dùng `sessionCan(...)`.
- **Web:**
  - **Ai được vào console:** account có `console.access`, tức ADMIN và TECHNICIAN. STAFF vẫn được hướng sang mobile app.
  - **Menu và nút theo quyền:**
    - Menu chỉ hiện mục mà phiên có quyền, ví dụ Statistics cần `statistics.read`.
    - Nút chuông thông báo cần `notification.read`.
    - Nút Enable / Disable cần `robot.configure` và robot nằm trong scope. Nút Manual cần `robot.manual.drive` và robot nằm trong scope.
  - **Đổi mật khẩu:** trang `/change-password` là bắt buộc khi đang dùng mật khẩu tạm, và vẫn mở được từ menu tài khoản.
  - **Quản lý tài khoản:** thêm role TECHNICIAN, nút **Reset password** (hiện mật khẩu tạm một lần) và nút **Robots** để gán robot cho Technician.
- **App:**
  - Có màn **Choose your own password**, chặn mọi màn khác khi `mustChangePassword` đang bật.
  - Session lưu `permissions`.
  - URL ảnh map có gắn token.

## 4. Kiểm thử

| Loại | Nội dung | Kết quả |
|---|---|---|
| Unit (xUnit) | `RolePermissionMatrixTests`: tên quyền hợp lệ; Admin có đủ quyền; STAFF / TECHNICIAN không có quyền nguy hiểm; `UserHas` chạy với cả hai loại claim role; `RequirePermission` báo lỗi khi gõ sai tên quyền | 38/38 qua; toàn bộ UnitTests 606 qua, 3 skip có sẵn |
| Architecture | 11 test cũ | qua |
| Integration (DB riêng `warotrans_test`) | `PasswordLifecycleEndpointTests`, `PermissionAuthorizationTests` (STAFF/TECHNICIAN không sửa được map; STAFF dừng được robot nhưng không lái được; Technician chỉ thấy robot được gán; `map-assets` trả 401 khi không có token); `Every_endpoint_declares_its_authorization_and_every_write_a_permission` quét toàn bộ endpoint | đã viết, **chưa chạy** (chờ bạn cho phép) |
| Web (vitest) | `permissions.test.ts`, `passwordProblem.test.ts`; typecheck và lint sạch | 25/25 qua |
| App (node test) | `identity-permissions.test.cjs` cùng 106 test cũ | 110/110 qua |
| Smoke test trên dev | Đăng nhập admin, staff, technician rồi thử các thao tác (`scratchpad/p1/smoke.ps1`) | STAFF publish map → 403, STAFF teleop → 403, Technician chưa được gán robot → không thấy robot nào; `/map-assets` không có token → 401, có token → 200 |

## 5. Hạn chế đã biết và việc tiếp theo

- **Audit log có cấu trúc** cho đổi mật khẩu, reset, đổi role và gán scope: làm ở Phase 2 (SY-05, OPS-02).
- **Hộp thư thông báo theo từng người** (STAFF / TECHNICIAN chưa có `notification.read`): làm ở Phase 2 (OPS-03).
- **Thay đổi scope của Technician** chỉ áp dụng cho kết nối SignalR mới. Kết nối đang mở giữ group cũ tối đa một vòng đời access token. Các API REST thì áp dụng ngay.
- **Chưa giới hạn số lần thử mật khẩu.** Chống brute-force khi đăng nhập / đổi mật khẩu chưa nằm trong IDN-01.
- **Quyền của app:** app vẫn giữ cờ `mobileCapabilities` để đánh dấu tính năng mà backend **chưa có**. Cờ này khác với quyền: một nút chỉ hiện khi tính năng đã có **và** phiên có quyền.

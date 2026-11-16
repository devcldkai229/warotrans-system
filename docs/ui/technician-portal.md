# Technician Portal (`/tech`)

Cổng web riêng cho kỹ thuật viên (role `TECHNICIAN`). Nó nằm trong cùng project `web/` với trang Admin, dùng chung component, API client, theme và i18n. Vì vậy style giống hệt Admin, nhưng menu chỉ có các màn hình về robot.

## 1. Bức tranh tổng thể

```
                 ┌──────────────── web/ (một Vite app, một build) ────────────────┐
 Đăng nhập ──►   │ RequireAuth (có session + console.access?)                     │
                 │   ├─ RequirePortal portal="tech"  (chỉ TECHNICIAN)             │
                 │   │     └─ PortalScope "tech"                                    │
                 │   │     └─ AppShell(nav=TECH_NAV, nhãn "Kỹ thuật viên")        │
                 │   │          /tech/fleet, /tech/issues, /tech/audit ...        │
                 │   │     └─ /tech/fleet/:code/manual  (toàn màn hình)           │
                 │   └─ RequirePortal portal="admin" ─► AppShell(nav=ADMIN_NAV)   │
                 │         /monitor/..., /operations/..., /configure/... (như cũ) │
                 └────────────────────────────────────────────────────────────────┘
                                     │  REST + SignalR (không đổi)
                                     ▼
                 Backend: RolePermissionMatrix[TECHNICIAN] + TechnicianRobotScope
```

**Backend không thay đổi gì.** Backend đã có sẵn:

- Role `TECHNICIAN` trong `RolePermissionMatrix` với các quyền: `robot.read/command/stop/manual.drive/maintenance/power/diagnostics/configure`, `issue.*`, `audit.read`, `notification.read`, `job.read`, `traffic.*`, ...
- Bảng `technician_robot_scopes`: technician **chỉ thấy và chỉ thao tác được** những robot được gán cho mình. Server tự lọc danh sách và từ chối lệnh với robot ngoài phạm vi.

## 2. Chức năng của portal

| Menu | Route | Màn hình dùng lại | Quyền cần |
|---|---|---|---|
| Robot | `/tech/fleet`, `/tech/fleet/:code` | `FleetPage` (bản đồ + panel chi tiết) | `robot.read` |
| (từ panel robot) Kỹ thuật | `/tech/fleet/:code/technical` | `RobotTechnicalPage` | `robot.read` |
| (từ panel robot) Điều khiển tay | `/tech/fleet/:code/manual` | `RobotManualPage` (joystick, toàn màn hình) | `robot.manual.drive` |
| (trong panel robot) Bảo trì / Nguồn / Dừng | — | `RobotControlCard` | `robot.maintenance`, `robot.power`, `robot.stop` |
| Sự cố | `/tech/issues[/:id]` | `IssuesPage` | `issue.read` |
| Lịch sử robot | `/tech/robot-history` | `RobotHistoryPage` | `robot.read` |
| Nhật ký hệ thống | `/tech/audit` | `AuditLogPage` | `audit.read` |
| Thông báo | `/tech/notifications` | `NotificationsPage` | `notification.read` |
| (từ một sự cố) Job | `/tech/jobs/:id` | `JobDetailPage`, chỉ xem | `job.read` |

Technician **không** vào được: Transport requests, danh sách Jobs, Facility/Map editor, Workflows, Management, Statistics.

## 3. Cách hoạt động

### 3.1 Đường dẫn theo portal: `shared/routing/`

Vấn đề: các màn hình dùng chung từng viết cứng link, kiểu `navigate('/monitor/fleet/...')`. Nếu dùng nguyên các màn hình đó trong portal, technician bấm một link là bị đẩy sang URL admin.

Cách giải quyết:

- `consolePaths.ts`: định nghĩa hai bộ đường dẫn, `pathsFor('admin')` và `pathsFor('tech')`. Mỗi bộ có `fleet(code)`, `robotManual(code)`, `job(id)`, `issues(id)`, `robotHistory(code)`, ... Hàm `toTechRoute(route)` đổi một route admin sang route tech tương ứng, hoặc trả về `null` nếu portal tech không có màn hình đó.
- `portal.tsx` (`PortalScope`) và `portalContext.ts`: một React context cho biết màn hình hiện tại đang nằm ở portal nào. Mặc định là `admin`.
- `usePaths.ts`: màn hình gọi `usePaths()` để lấy bộ đường dẫn đúng với portal hiện tại.

Các màn hình đã chuyển sang `usePaths()`: FleetPage, RobotDetailPanel, RobotTechnicalPage, RobotManualPage, RobotHistoryPage, IssuesPage, JobDetailPage, NotificationBell, NotificationsPage. Riêng **Thông báo**: server lưu route kiểu admin (`/monitor/jobs/...`), nên `notificationTarget(notification, paths)` dịch route đó qua `paths.translate`. Thông báo trỏ tới màn hình mà tech không có (ví dụ Transport request) sẽ không bấm được, thay vì dẫn tới một trang bị từ chối.

Ở `JobDetailPage` trong portal tech, nút quay lại đổi thành "Quay lại" (`navigate(-1)`), vì tech không có trang danh sách Jobs hay Requests.

### 3.2 Chọn portal theo role: `features/auth/portalAccess.ts`, `RequirePortal.tsx`

- `TECHNICIAN` mở route admin thì được chuyển sang **đúng màn hình tương ứng** trong `/tech` nếu có (ví dụ `/monitor/fleet/RBT-001` thành `/tech/fleet/RBT-001`), còn lại về `/tech/fleet`. Vì vậy sau khi đăng nhập, technician tự động vào portal tech mà không cần sửa `LoginPage`.
- **Mỗi role chỉ có một portal.** `ADMIN` chỉ dùng trang admin. Nếu Admin mở một URL `/tech/...`, họ được đưa về đúng màn hình tương ứng bên admin (ví dụ `/tech/issues/9` thành `/operations/issues/9`, dùng `toAdminRoute`), không có cách nào vào portal tech.
- `STAFF` vẫn bị chặn ở `RequireAuth`, vì không có `console.access`.

Chọn portal theo role chỉ ảnh hưởng menu và trang đích (UX). Màn hình nào được làm gì vẫn do permission quyết định (`Guard`, `can()`, `canActOnRobot()`), và server kiểm tra lại ở mỗi request.

### 3.3 Shell dùng chung: `app/AppShell.tsx`, `app/nav.ts`

`AppShell` nhận thêm các props `nav`, `home`, `portalLabel`. Tech portal truyền `TECH_NAV` và nhãn "Kỹ thuật viên" (badge màu teal cạnh logo). Header, theme sáng/tối, đổi ngôn ngữ, chuông thông báo và menu tài khoản giữ nguyên.

### 3.4 Chưa được gán robot

Khi `capabilities.robotScope.allRobots === false` và danh sách robot trống, Fleet hiện thông báo "Bạn chưa được gán robot nào. Hãy nhờ quản trị viên gán các robot bạn phụ trách."

## 4. Chạy và kiểm tra

```bash
# backend (Development seed sẵn tài khoản technician / Technician@123)
dotnet run --project backend/src/WaroTrans.Host --launch-profile http
# web
cd web && npm run dev     # http://localhost:5173
```

1. Tài khoản technician: dùng `tech01` (tạo ngày 2026-11-15 trên DB dev, đã gán RBT-001 và RBT-SIM-01, lần đầu đăng nhập phải đổi mật khẩu tạm), hoặc tài khoản seed `technician` / `Technician@123` (chưa gán robot). Admin gán robot ở **Management → Accounts → robot scope**.
2. Đăng nhập bằng tài khoản technician. Trang tự chuyển sang `/tech/fleet`, menu chỉ còn: Robot, Sự cố, Lịch sử robot, Nhật ký hệ thống, Thông báo.
3. Chọn robot. Từ đó mở Kỹ thuật, Điều khiển tay, Bảo trì, Nguồn. Bấm thử các link (job gần đây, lịch sử, sự cố): URL phải luôn giữ tiền tố `/tech/...`.
4. Gõ thử `/monitor/requests` hoặc `/management`: sẽ bị chuyển về `/tech/fleet`.
5. Đăng nhập `admin` rồi gõ `/tech/fleet`: sẽ bị chuyển về `/monitor/fleet`.

Kiểm tra tự động:

```bash
cd web
npm run typecheck
npm run lint
npx vitest run      # chạy từ đường dẫn ổ D: viết HOA
```

> Lưu ý trên Windows: nếu chạy `vitest` khi đang ở `d:\...` (ổ đĩa chữ thường), mọi file test đều fail với lỗi `Cannot read properties of undefined (reading 'config')`, vì vitest bị nạp hai lần do khác hoa/thường ở ký tự ổ đĩa. Hãy `cd D:\...` rồi chạy lại.

Test mới:

- `shared/routing/consolePaths.test.ts`: đổi route admin sang tech, và trả về `null` cho màn hình chỉ admin có.
- `features/auth/portalAccess.test.ts`: mỗi role một portal, technician hoặc admin mở nhầm portal thì được chuyển tới đâu.

## 5. Còn thiếu hoặc có thể làm tiếp

- Backend vẫn lưu route thông báo theo dạng admin; web đang dịch lại. Nếu sau này có app riêng, có thể cho server lưu route trung tính.
- Technician có quyền `job.pause` và `traffic.manage`, nhưng portal chưa có màn hình Traffic riêng. Các thao tác đó hiện chỉ xuất hiện ở những chỗ mà màn hình robot hoặc job đã hiển thị sẵn.
- Chưa có test giao diện (component/e2e) cho việc chuyển hướng; hiện mới test phần logic thuần.

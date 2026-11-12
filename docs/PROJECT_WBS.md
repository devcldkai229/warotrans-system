# WaroTrans — Project Work Breakdown Structure

**Phiên bản:** 1.0 · **Ngày:** 09/11/2026  
**Nguồn đối chiếu:** `web/`, `app/`, `backend/` (warotrans-system) + aim nghiệp vụ/robot lab  
**Mẫu cột:** theo WBS FPT (Function/Screen · Feature · Level · Details · Planned · Status)

### Quy ước Level\*

| Level | Tiêu chí |
|---|---|
| **Simple** | ≤ 7 fields và ≤ 3 transactions |
| **Medium** | ≤ 15 fields và ≤ 7 transactions |
| **Complex** | > 15 fields hoặc > 7 transactions |

**Fields** = thành phần màn hình / trường dữ liệu · **Transactions** = nút/hành động/giao dịch DB-API

### Quy ước Status

| Status | Ý nghĩa |
|---|---|
| **Completed** | Có UI/API đủ dùng cho luồng chính (chưa mặc định = robot lab PASS) |
| **Partial** | Có màn hình/API nhưng mock, capability khóa, thiếu hành động, hoặc luồng chưa khép |
| **Pending** | Aim / trong kế hoạch, chưa có implementation đủ để dùng |
| **N/A** | Ngoài phạm vi sản phẩm WaroTrans (so với mẫu web marketing) |

### Quy ước Planned

| Iteration | Mục tiêu |
|---|---|
| **Iteration 1** | Demo lõi 1 robot: TR → Job → MOVE → HUMAN → DB |
| **Iteration 2** | Kho đúng + Staff ops + cancel/pause/issue tối thiểu |
| **Iteration 3** | Technician / multi-robot / recovery / inventory truth |
| **Iteration 4** | Maturity: phiếu NX, recurring, offline, RBAC chi tiết |

---

## 1. Common / Auth

| # | Function/Screen | Feature | Level\* | Function/Screen Details | Planned | Status |
|---:|---|---|---|---|---|---|
| 0 | User Login (Web) | Common | Simple | Đăng nhập Admin; JWT; chặn non-ADMIN | Iteration 1 | Completed |
| 1 | User Login (Mobile) | Common | Simple | Đăng nhập Staff/Admin trên app Expo | Iteration 1 | Completed |
| 2 | User Logout / Refresh | Common | Simple | Logout + refresh session API | Iteration 1 | Completed |
| 3 | User Authorization | Common | Medium | Role ADMIN/STAFF; policy AdminOnly/StaffOrAdmin; chưa fine-grained | Iteration 2 | Partial |
| 4 | Accounts List | Common | Medium | Quản lý tài khoản (create/update/status) | Iteration 1 | Completed |
| 5 | Roles List | Common | Simple | Xem enum ADMIN/STAFF; chưa permission matrix | Iteration 2 | Partial |
| 6 | User Profile | Common | Simple | `/me` + hiển thị user; chưa màn profile đầy đủ | Iteration 2 | Partial |
| 7 | Change Password | Common | Simple | Đổi mật khẩu tự phục vụ | Iteration 3 | Pending |
| 8 | Reset Password | Common | Simple | Admin reset / quên mật khẩu | Iteration 3 | Pending |
| 9 | User Register (public) | Common | Simple | Đăng ký công khai — hệ thống nội bộ, Admin tạo account | — | N/A |

---

## 2. Admin Web — Monitor

| # | Function/Screen | Feature | Level\* | Function/Screen Details | Planned | Status |
|---:|---|---|---|---|---|---|
| 10 | Fleet Dashboard | Monitor | Complex | Danh sách robot + map live + SignalR pose + traffic overlay | Iteration 1 | Completed |
| 11 | Robot Detail Panel | Monitor | Medium | Trạng thái robot; history/job còn mock; Pause/Unavailable/Localize chưa gắn | Iteration 2 | Partial |
| 12 | Robot Manual Control | Monitor | Complex | Teleop joystick + navigate + camera stream | Iteration 1 | Completed |
| 13 | Register Robot | Monitor | Medium | Đăng ký robot vào fleet từ UI | Iteration 1 | Completed |
| 14 | Transport Requests Monitor | Monitor | Complex | List/search TR; tạo; queue; start; cancel nút chưa gọi API | Iteration 1 | Partial |
| 15 | Create Transport Request (Web) | Monitor | Complex | Composer chọn workflow, container, from/to, submit API | Iteration 1 | Completed |
| 16 | Job Detail (Web) | Monitor | Complex | Chi tiết Job/steps; confirm human step | Iteration 1 | Completed |
| 17 | Jobs List Monitor | Monitor | Medium | `/monitor/jobs` đang redirect sang requests | Iteration 3 | Pending |
| 18 | Job Summary Side Panel | Monitor | Simple | Panel phụ vẫn đọc mock jobs | Iteration 2 | Partial |
| 19 | Statistics Dashboard | Monitor | Medium | Thống kê TR/Job/Robot | Iteration 1 | Completed |
| 20 | Notifications Bell | Monitor | Simple | Inbox Admin + mark read; chưa trang center | Iteration 1 | Partial |
| 21 | Notifications Center | Monitor | Medium | Trang thông báo đầy đủ + deep link | Iteration 3 | Pending |
| 22 | Traffic Release Control | Monitor | Simple | API `releaseTrafficAfterClearance` chưa có UI | Iteration 3 | Pending |
| 23 | Dispatch Candidates View | Monitor | Medium | Xem lý do chọn robot / override | Iteration 3 | Pending |

---

## 3. Admin Web — Configure

| # | Function/Screen | Feature | Level\* | Function/Screen Details | Planned | Status |
|---:|---|---|---|---|---|---|
| 24 | Facility Maps List | Configure | Medium | Catalog map version; publish/archive/clone | Iteration 1 | Completed |
| 25 | Map Editor | Configure | Complex | Vẽ zone/edge/endpoint; import asset; gán workflow | Iteration 1 | Completed |
| 26 | Endpoint Group Manager | Configure | Medium | CRUD nhóm endpoint (park/charge…) — DB có, thiếu API/UI | Iteration 3 | Pending |
| 27 | Workflows List | Configure | Medium | Danh sách workflow + publish | Iteration 1 | Completed |
| 28 | Workflow Editor | Configure | Complex | Tạo/sửa steps, bindings, metadata | Iteration 1 | Completed |

---

## 4. Admin Web — Management

| # | Function/Screen | Feature | Level\* | Function/Screen Details | Planned | Status |
|---:|---|---|---|---|---|---|
| 29 | Warehouses List | Management | Medium | Tạo/list warehouse | Iteration 1 | Completed |
| 30 | Products List | Management | Medium | Tạo/list/set status product | Iteration 1 | Completed |
| 31 | Categories List | Management | Simple | Tạo/list category | Iteration 1 | Completed |
| 32 | Containers List | Management | Medium | List read-only; create qua receiving | Iteration 1 | Partial |
| 33 | Inventory List | Management | Medium | Xem tồn; chưa chứng từ cập nhật sau handover | Iteration 2 | Partial |
| 34 | Storage Locations List | Management | Medium | Tạo/list/set status location | Iteration 1 | Completed |
| 35 | Master Data Edit/Delete | Management | Medium | Update/Delete đầy đủ warehouse/product/location | Iteration 3 | Pending |

---

## 5. Staff Mobile App

| # | Function/Screen | Feature | Level\* | Function/Screen Details | Planned | Status |
|---:|---|---|---|---|---|---|
| 36 | Home / Ops Map | Staff App | Complex | Bản đồ vận hành + robot/job gần | Iteration 1 | Completed |
| 37 | Jobs List | Staff App | Medium | Danh sách job; tab Mine/Accept (claim khóa) | Iteration 1 | Partial |
| 38 | Job Detail | Staff App | Complex | Stepper; Verify/handover; pause khóa; resume OK | Iteration 1 | Partial |
| 39 | Confirm Handover | Staff App | Medium | Scan/verify container → confirm step | Iteration 1 | Completed |
| 40 | Claim Human Task | Staff App | Medium | Nhận task / My Tasks — UI có, capability off | Iteration 2 | Partial |
| 41 | Transport Hub | Staff App | Simple | Menu tạo TR / history / receiving | Iteration 1 | Completed |
| 42 | Create Transport Request | Staff App | Complex | Chọn template workflow + container + submit/queue | Iteration 1 | Completed |
| 43 | Transport History | Staff App | Medium | Lịch sử TR; chưa đủ chain Job–manifest–actor | Iteration 1 | Partial |
| 44 | Transport Request Detail | Staff App | Medium | Chi tiết TR + details | Iteration 1 | Completed |
| 45 | Inventory Lookup | Staff App | Medium | Tra cứu product/container/stock | Iteration 1 | Completed |
| 46 | Create Container (Receiving) | Staff App | Complex | Màn nhận hàng; capability off; BE Create/Resolve có | Iteration 2 | Partial |
| 47 | Barcode Scanner | Staff App | Simple | Quét/nhập barcode | Iteration 1 | Completed |
| 48 | Job Live Map | Staff App | Medium | Theo dõi job trên map | Iteration 1 | Completed |
| 49 | Fleet Recall | Staff App | Medium | Hủy lệnh robot / recall | Iteration 1 | Completed |
| 50 | Report Path Hazard | Staff App | Medium | Báo chặn đường; submit disabled | Iteration 3 | Partial |
| 51 | Payload Recovery | Staff App | Complex | UI recovery; actions disabled | Iteration 3 | Partial |
| 52 | Report Issue | Staff App | Medium | Modal issue; capability off; BE IssueReport chưa API | Iteration 2 | Partial |
| 53 | Confirm All Handover | Staff App | Medium | Xác nhận nhiều container một lần | Iteration 3 | Pending |
| 54 | Staff Notifications | Staff App | Medium | Inbox Staff thật (hiện derive local) | Iteration 3 | Pending |
| 55 | Offline Sync | Staff App | Medium | Đồng bộ khi mất mạng | Iteration 4 | Pending |
| 56 | Mobile Teleop | Staff App | Complex | Điều khiển tay trên mobile | Iteration 4 | Pending |

---

## 6. Backend Services (capability, không phải 1 màn hình)

| # | Function/Screen | Feature | Level\* | Function/Screen Details | Planned | Status |
|---:|---|---|---|---|---|---|
| 57 | Create / Queue TR | Backend | Complex | Idempotent provision Job từ TR | Iteration 1 | Completed |
| 58 | Cancel / Reject TR | Backend | Medium | Enum có; thiếu API Cancel/Reject | Iteration 2 | Pending |
| 59 | Job Start / Cancel / Resume | Backend | Complex | Runtime Job + MQTT MOVE | Iteration 1 | Completed |
| 60 | Confirm Job Step (HUMAN) | Backend | Medium | Staff/robot confirm; mismatch reject | Iteration 1 | Completed |
| 61 | Pause Job (operator) | Backend | Medium | Resume có; Pause API chưa | Iteration 2 | Pending |
| 62 | WAIT / CHECK Runtime | Backend | Complex | Catalog có; V1 fail / not evaluated | Iteration 2 | Pending |
| 63 | Stock Update after Handover | Backend | Complex | Cập nhật location + InventoryStock 1 lần | Iteration 2 | Pending |
| 64 | Container Lifecycle APIs | Backend | Medium | PACKED/IN_TRANSIT/STORED… chưa đủ transition | Iteration 2 | Partial |
| 65 | Dispatch Eligibility Engine | Backend | Complex | Chọn robot theo health/capacity/workload | Iteration 3 | Partial |
| 66 | Semantic Traffic Grant | Backend | Complex | Reservation dual-lane / single occupancy | Iteration 1 | Partial |
| 67 | Command Lifecycle ACK/RESULT | Backend | Complex | Timeout, orphan cancel, reconcile | Iteration 1 | Partial |
| 68 | Issue Report APIs | Backend | Medium | Mongo schema; chưa CRUD | Iteration 2 | Pending |
| 69 | Audit Log Write/Query | Backend | Medium | Schema có; chưa ghi | Iteration 3 | Pending |
| 70 | Notifications (Staff target) | Backend | Medium | Shared Admin inbox; chưa per-user Staff | Iteration 3 | Partial |
| 71 | Transactional Outbox | Backend | Complex | Event durable sau DB commit | Iteration 3 | Pending |
| 72 | Multi-Batch / Multi-Job TR | Backend | Complex | 1 TR → N Batch/Job; V1 thường 1 Job | Iteration 3 | Partial |
| 73 | Payload Recovery Workflow | Backend | Complex | RECOVERY_REQUIRED path chưa khép | Iteration 3 | Pending |
| 74 | Fine-grained Permissions | Backend | Medium | TECHNICIAN + permission claims | Iteration 3 | Pending |

---

## 7. Robot / Lab Ops (aim vận hành)

| # | Function/Screen | Feature | Level\* | Function/Screen Details | Planned | Status |
|---:|---|---|---|---|---|---|
| 75 | RBT-001 NAVIGATE Lab | Robot Ops | Complex | Endpoint/yaw/keepout/speed/stop trên map thật | Iteration 1 | Partial |
| 76 | MOVE + HUMAN Button E2E | Robot Ops | Complex | MQTT ↔ nút ↔ JobStep ↔ (stock) | Iteration 1 | Partial |
| 77 | Dual-Robot Traffic (RBT-002) | Robot Ops | Complex | Hai lane / single wait / recovery | Iteration 3 | Pending |
| 78 | Soft Stop / Watchdog | Robot Ops | Medium | Stop request ≠ ACK ≠ zero velocity | Iteration 2 | Partial |
| 79 | Battery Voltage Telemetry | Robot Ops | Medium | ADC 0–25V; SOC ước lượng; UI UNKNOWN | Iteration 3 | Pending |
| 80 | Deploy / Rollback Runbook | Robot Ops | Medium | Known-good commit + LAB_RUNBOOK | Iteration 1 | Partial |

---

## 8. Aim Product (chưa có / maturity)

| # | Function/Screen | Feature | Level\* | Function/Screen Details | Planned | Status |
|---:|---|---|---|---|---|---|
| 81 | Receiving Documents (Phiếu nhập) | Aim | Complex | Phiếu liên kết TR/Container/Stock + duyệt | Iteration 4 | Pending |
| 82 | Outbound / Picking Documents | Aim | Complex | Phiếu xuất + reserve stock | Iteration 4 | Pending |
| 83 | Incident Center UI | Aim | Complex | Ticket OPEN→…→CLOSED gắn robot/job/TR | Iteration 3 | Pending |
| 84 | Robot Technical Dashboard | Aim | Complex | Pose, Nav2, fault, authority, command — realtime | Iteration 3 | Pending |
| 85 | Maintenance Mode Console | Aim | Medium | OOS / return-to-service checklist | Iteration 3 | Pending |
| 86 | Multi-wave / Recurring TR | Aim | Complex | Lịch F05, split trip F07/F11 | Iteration 4 | Pending |
| 87 | Partial Failure per Container | Aim | Complex | A OK / B fail; TR PARTIALLY_COMPLETED đúng | Iteration 3 | Pending |
| 88 | Public Blog / Marketing CMS | Aim | — | Ngoài phạm vi WMS/AMR | — | N/A |

---

## Tóm tắt nhanh

| Status | Số mục (trừ N/A) | Ý nghĩa |
|---|---:|---|
| **Completed** | ~28 | Đủ dùng luồng lõi Admin/Staff/API |
| **Partial** | ~30 | Có skeleton; cần nối API/capability/lab |
| **Pending** | ~28 | Aim còn lại để gọi product done |
| **N/A** | 2 | Không thuộc WaroTrans |

### Cột Feature (nhóm)

- **Common** — Auth & access  
- **Monitor** — Admin theo dõi fleet/TR/job  
- **Configure** — Map & workflow  
- **Management** — Master data kho  
- **Staff App** — Mobile vận hành  
- **Backend** — Capability hệ thống  
- **Robot Ops** — Lab / robot thật  
- **Aim** — Mục tiêu sản phẩm còn lại  

### Ghi chú đối chiếu mẫu hình

Mẫu FPT có *Home Page, Blogs, Sliders, Marketing* → với WaroTrans thay bằng **Fleet / TR / Job / Warehouse / Staff ops / Robot lab**.  
Cột **Status** trong mẫu gốc toàn *Pending*; bản này điền theo audit code thực tế (09/11/2026).  
`Completed` **không** đồng nghĩa physical robot PASS.

---

*File này dùng để copy sang Excel/Sheets theo đúng cột mẫu. Có thể đánh số lại khi import.*

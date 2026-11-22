# Hướng dẫn: lấy dữ liệu workflow để test

Dành cho các bạn trong team cần workflow (INBOUND, OUTBOUND_RETRIEVAL, INTERNAL_RELOCATION, ROBOT_RETURN_TO_PARK,
ROBOT_CHARGING) trên máy mình để test. Có hai cách, chọn **một**.

| | Cách A: restore snapshot | Cách B: seed JSON rồi tự cấu hình |
|---|---|---|
| Nhanh | ~1 phút | ~10 phút |
| Kết quả | DB giống hệt máy Nguyên ngày 21/11: 5 workflow **PUBLISHED** đã cấu hình, nhóm điểm PARKING/CHARGING, 134 Container, 0 Transport Request, 0 Job | Giữ nguyên dữ liệu của bạn, thêm 5 workflow **DRAFT** bạn tự điền rồi Publish |
| Mất dữ liệu cũ | **Có** (thay toàn bộ DB `warotrans`) | Không |
| Dùng khi | Muốn test ngay theo đúng bộ dữ liệu chung | DB của bạn có dữ liệu riêng cần giữ |

Trước cả hai cách: `git pull` nhánh có thay đổi này, và Docker đang chạy (`warotrans-postgres`).

## Cách A: restore snapshot (khuyên dùng)

1. **Tắt backend** (cổng 5090).
2. Ở thư mục `warotrans-system`, chạy PowerShell:
   ```powershell
   .\tools\restore-db-snapshot.ps1
   ```
   Script lấy snapshot mới nhất `infrastructure/snapshots/warotrans_postgres_workflows_ready_*.dump`, xóa và tạo lại DB
   `warotrans`, restore, rồi in danh sách workflow (phải thấy 5 dòng `v1 PUBLISHED`).
   - Muốn thử trước vào DB khác: `.\tools\restore-db-snapshot.ps1 -Database warotrans_check`.
3. Bật backend. Migration mới hơn snapshot (nếu có) tự chạy khi khởi động.
4. Đăng nhập `admin` / `Admin@123`, mở **Configure → Workflows**: 5 workflow Published.

Snapshot dùng bản đồ **MAP-ONE-V013** (Gazebo `map_one_v013`). Các điểm đã chọn sẵn: inspection = EP-INSPECTION,
cổng = EP-INBOUND / EP-OUTBOUND, nhóm PARKING (Parking A, B), nhóm CHARGING (EP-CHARGE).

## Cách B: seed JSON, tự cấu hình

1. Bật backend ít nhất một lần cho migration chạy, rồi ở thư mục `warotrans-system`:
   ```bash
   dotnet run --project backend/tools/WorkflowSeed -- --dry-run   # xem trước
   dotnet run --project backend/tools/WorkflowSeed                # tạo các workflow DRAFT
   ```
   Mã nào DB đã có thì tool **bỏ qua**, không ghi đè. Muốn tạo version mới từ file: thêm `--new-version`.
2. Trên web, **Configure → Workflows**, mở từng workflow DRAFT và chọn giá trị ở các biến **ADMIN_INPUT** (ô chọn
   điểm trên bản đồ, không cần dán ID):

   | Workflow | Biến | Chọn |
   |---|---|---|
   | INBOUND | `inspectionEndpointId` | EP-INSPECTION |
   | INBOUND | `inboundEndpointId` | EP-INBOUND |
   | OUTBOUND_RETRIEVAL | `inspectionEndpointId`, `outboundEndpointId` | EP-INSPECTION, EP-OUTBOUND |
   | INTERNAL_RELOCATION | `inspectionEndpointId` | EP-INSPECTION |
   | ROBOT_RETURN_TO_PARK | `parkEndpointGroupId` (không bắt buộc) | Nhóm chỗ đỗ, hoặc để trống |
   | ROBOT_CHARGING | `chargerEndpointGroupId` (không bắt buộc) | Nhóm trạm sạc, hoặc để trống |
3. **Publish** từng workflow. Còn biến bắt buộc chưa chọn thì Publish báo lỗi.
4. (Tuỳ chọn) Nhóm điểm: mở bản đồ → **Nhóm điểm**. Bản đồ đang Published thì phải **Clone & edit**, tạo nhóm, rồi
   Publish bản đồ mới. Không có nhóm thì Return to park / Go to charger chọn trong mọi điểm PARK / CHARGER.

## Kiểm tra nhanh sau khi có dữ liệu

- **Return to park / Go to charger** trên trang robot chạy được (trước đây lỗi `workflow_not_published` vì chưa có 2
  workflow này).
- **Tạo Transport Request** INBOUND: ô From tự khóa ở EP-INBOUND; có ô **Check Quality?** — chọn `true` thì robot ghé
  EP-INSPECTION trước khi cất lên kệ.

## Khi cần chia sẻ workflow đã sửa

Sửa trên giao diện xong, xuất ra file seed rồi commit:
```bash
dotnet run --project backend/tools/WorkflowSeed -- --export backend/seed/workflows
```
File xuất ra không chứa giá trị ADMIN_INPUT (chúng là ID theo từng bản đồ). Chi tiết: `04-seed-workflow-bang-json.md`.

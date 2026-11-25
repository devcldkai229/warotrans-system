# Phiếu nhập chọn container có sẵn, bỏ đơn vị tính, và kiểm tra chất lượng trên app

Ngày: 2026-11-24.

## 1. Vấn đề

1. Staff bấm **"Tạo phiếu nhập"** ở màn Tạo container. Màn tạo phiếu mở ra **trống**, nên phiếu tạo thêm **4 thùng mới**, còn 4 thùng vừa tạo bị bỏ rơi.
2. Màn Tạo container **không có ô số lượng**. Thùng luôn lưu `1 container` (giá trị mặc định), và không có API nào sửa lại.
3. Đơn vị tính (`contents_unit`) là chữ gõ tay cho từng thùng và không dùng cho việc gì: tồn kho đếm theo **số thùng**, không theo số hàng.
4. App chưa có phần chọn mã lỗi như web: không đạt kiểm tra và loại container đều ghi thành `OTHER`.
5. Trang Chi tiết công việc coi bước kiểm tra chất lượng là bước "giao hàng", nên mở hộp xác nhận giao hàng và bị backend từ chối.
6. Robot kết thúc Job ở xa bãi nhà thì **không lệnh nào đưa về được**, kể cả lệnh "Về chỗ đỗ".

## 2. Thay đổi

### 2.1 Bỏ đơn vị tính, container chỉ còn số lượng

- Bỏ `Container.ContentsUnit` và cột `warehouse.containers.contents_unit`; migration là `DropContainerContentsUnit`.
  - Constraint `ck_containers_contents` đổi thành `contents_quantity IS NULL OR contents_quantity > 0`.
  - `ck_containers_creation_receipt` không còn đòi đơn vị.
  - Khi rollback (`Down`), các thùng có số lượng được điền lại đơn vị `pcs`.
- `POST /containers` (tạo theo lô): nhóm không còn `unit`. Request còn gửi `unit` sẽ bị từ chối (400), vì request cấm trường lạ.
- Xác nhận phiếu nhập chỉ đòi **số lượng > 0** (`container_contents_incomplete`).
- Hàng bị giữ (sự cố) và trang Sự cố trên web: hiện số lượng, không kèm đơn vị.

### 2.2 Sửa số lượng trước khi nhập kho

- `PUT /api/warehouse/containers/contents` với body `{ items: [{ containerId, quantity }] }`:
  - quyền `container.create`;
  - sửa nhiều thùng một lúc, hoặc tất cả hoặc không thùng nào;
  - có ghi audit `container.contents_set`.
- Chỉ sửa được thùng **CREATED** và chưa nằm trên phiếu nhập đã xác nhận. Ngoài ra trả `container_contents_locked`.
- Phiếu nhập **từ chối** thùng chưa có số lượng ngay khi thêm vào phiếu (`container_contents_incomplete`).

### 2.3 Danh sách thùng chờ vào phiếu

`GET /api/warehouse/containers?awaitingInbound=true` trả các thùng thoả cả ba điều kiện:
- trạng thái CREATED;
- chưa nhập kho;
- không nằm trên phiếu nhập nào đang mở.

### 2.4 App: luồng tạo container → phiếu nhập

```
Tạo container (sản phẩm, SỐ LƯỢNG MỖI THÙNG, số thùng) ──► "Tạo phiếu nhập" (mang theo các thùng vừa tạo)
Phiếu kho ──► "Phiếu mới" (Nhập kho) ──────────────────────┤
                                                           ▼
     Chọn container có sẵn (gom theo sản phẩm, quét mã, chọn tất cả, sửa số lượng)
     "Tạo container mới" → màn Tạo container → quay lại
                                                           ▼
     Xem lại → Lưu nháp / Tạo và xác nhận
     (sửa số lượng trước, rồi tạo phiếu với containerIds)
```

- Màn tạo phiếu nhập **không tạo thùng mới** nữa.
- Màn Tạo container có bước **"Số lượng hàng mỗi thùng"** (bắt buộc), áp dụng cho cả "Mã mới" và "Nhãn in sẵn".

### 2.5 App: mã lỗi container giống web

- Bộ mã chung nằm ở `app/src/shared/containerProblems.ts`, giống `web/src/features/operations/containerProblems.ts`.
- **Loại container khỏi chuyến** (Container cannot go on): bắt buộc chọn một mã nhìn thấy từ bên ngoài, gồm Sai / Thiếu container, Vỏ thùng hỏng, Nhãn không đọc được, Không chở an toàn được, Khác. Mã được gửi kèm là `problemCode`.
- **Không đạt kiểm tra chất lượng:** chọn **một hoặc nhiều** mã lỗi và gửi kèm là `defects`.
- **Báo sự cố** ở trạm giao nhận: bỏ "Lệch số lượng" (chỉ phát hiện khi mở thùng ở khu kiểm tra), thêm "Không chở an toàn được".
- Phần chặn Confirm khi có sự cố Sai / Thiếu container thì app đã có sẵn, giống web.

### 2.6 App: kiểm tra chất lượng trên trang Chi tiết công việc

- Khi Job chờ bước `INSPECTION_CONFIRM`, trang hiện "Thùng cần kiểm tra" kèm nút **"Kiểm tra {mã}"** cho từng thùng trên robot. Nút mở màn kiểm tra (Đạt / Không đạt + mã lỗi). Trước đây trang mở nhầm hộp xác nhận giao hàng.
- Màn kiểm tra có thêm câu nhắc: *"Báo Không đạt cho từng thùng lỗi trước. Bấm Đạt sẽ hoàn tất kiểm tra cho mọi thùng còn trên robot."*
  - Lý do: backend coi **Đạt** là đạt cho tất cả thùng còn lại.

### 2.7 Web

Bảng **Quản lý → Containers** có thêm cột **Số lượng**.

### 2.8 Lệnh "Về chỗ đỗ" ưu tiên bãi nhà của robot

- Ở chế độ giao thông Semantic, robot không còn kế hoạch giao thông (sau mỗi Job) thì chỉ được xuất phát từ **bãi nhà** (`Traffic:RobotHomeEndpoints`).
- Trước đây lệnh "Về chỗ đỗ" chọn **bãi gần nhất**. Nếu đó không phải bãi nhà (ví dụ đứng gần EP-PARKING-B), lệnh bị từ chối với `robot_not_at_home`, và robot kẹt luôn.
- Giờ `RobotCareService.ReturnToParkAsync` chọn **bãi nhà trước** (nếu trống), giống luồng robot rảnh tự về bãi.

## 3. File chính

| File | Nội dung |
|---|---|
| `Warehouse/Entities/Container.cs`, `Persistence/Configurations/ContainerConfiguration.cs`, `Migrations/*DropContainerContentsUnit*` | Bỏ đơn vị |
| `Warehouse/Features/ContainerContents/ContainerContentsEndpoint.cs` | `PUT /containers/contents` |
| `Warehouse/Features/ListContainers/*` | `awaitingInbound` |
| `Warehouse/Features/AddStockVoucherLines/Handler.cs` | Từ chối thùng chưa có số lượng |
| `WorkflowExecution/Features/RobotCare/RobotCareService.cs` | Về chỗ đỗ: ưu tiên bãi nhà |
| App: `InboundContainerSelection.tsx`, `CreateStockVoucherScreen.tsx`, `CreateContainerScreen.tsx` | Luồng phiếu nhập |
| App: `shared/containerProblems.ts`, `shared/components/ProblemCodeChips.tsx`, `VerifyModal.tsx`, `ScanScreen.tsx`, `IssueReportingModal.tsx`, `JobDetailScreen.tsx` | Mã lỗi, kiểm tra chất lượng |
| Web: `features/management/ContainersSection.tsx`, `features/operations/IssuesPage.tsx` | Cột số lượng, bỏ đơn vị |

## 4. Chưa làm

- Dời vị trí lưu trữ (kệ) theo **mã endpoint** khi xuất bản map hoặc nhập snapshot (xem báo cáo ngày 24/11). Trên DB dev đã dời tay 3 kệ.
- Phiếu PN-20261124-000001 (thùng 051–054) bị tạo thừa từ luồng cũ. Mình để nguyên, chưa huỷ.

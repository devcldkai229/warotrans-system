# Seed workflow bằng file JSON

Tài liệu giải thích thay đổi ngày 21/11/2026: định nghĩa workflow mặc định nằm trong **file JSON** thay vì viết cứng
trong C#, và seed ra workflow ở trạng thái **DRAFT** để admin điền tham số rồi mới Publish.

## 1. File seed

Thư mục `backend/seed/workflows/`, mỗi workflow một file:

| File | Nội dung |
|---|---|
| `INBOUND.json` | Lấy hàng ở cổng Inbound → QUALITY_INSPECTION (khi `checkQuality = true`) → cất lên kệ |
| `OUTBOUND_RETRIEVAL.json` | Lấy hàng ở kệ → QUALITY_INSPECTION → giao ở cổng Outbound |
| `INTERNAL_RELOCATION.json` | Kệ → QUALITY_INSPECTION → kệ khác |
| `ROBOT_RETURN_TO_PARK.json` | Kiểm tra robot → về chỗ đỗ (có biến nhóm `parkEndpointGroupId`) |
| `ROBOT_CHARGING.json` | Kiểm tra robot → tới trạm sạc → người xác nhận cắm sạc (có biến nhóm `chargerEndpointGroupId`) |

- Định dạng **giống hệt body của `POST /api/workflow-execution/workflows`** (camelCase, enum viết bằng tên): chép qua
  lại được giữa file, API và màn sửa workflow.
- **Không chứa giá trị ADMIN_INPUT** (`configuredValue`): đó là UUID của điểm / nhóm điểm trên một bản đồ cụ thể, khác
  nhau giữa các DB. Nếu file có, bộ đọc bỏ đi.
- Biến điểm có `format`: `WAYPOINT` (một điểm) hoặc `WAYPOINT_GROUP` (một nhóm điểm), để màn sửa workflow hiện ô chọn.

## 2. Bộ chuyển đổi (`WorkflowSeedJson`)

`backend/src/Modules/WorkflowExecution/Seeding/WorkflowSeedJson.cs`:

- `ReadDirectory(dir)`: đọc mọi `*.json` theo tên file. Mỗi file phải đọc được, qua luật DRAFT của
  `WorkflowDefinitionValidator`, và có mã riêng. Lỗi báo kèm **tên file**, **dòng** và **trường**, ví dụ
  `bad.json: invalid JSON at line 3 ($.tasks[0]) …`.
- `Write(workflow)`: chiều ngược lại, workflow trong DB → nội dung file seed (không id, không version, không giá trị
  ADMIN_INPUT).

## 3. Seeder (`StandardWorkflowSeeder`) — không tự Publish nữa

| Trong DB | Seeder làm gì |
|---|---|
| Chưa có mã đó | Tạo **v1 DRAFT** |
| Bản mới nhất giống file (bỏ qua giá trị ADMIN_INPUT) | `unchanged` |
| Bản mới nhất là DRAFT | Bỏ qua (có thể là phần admin đang làm dở) |
| Bản mới nhất PUBLISHED và khác file | Bỏ qua; chạy với `--new-version` thì tạo version DRAFT mới từ file |

Bản PUBLISHED không bao giờ bị sửa; Job giữ version nó được tạo từ.

## 4. Cách dùng tool

```bash
# Xem trước (không ghi)
dotnet run --project backend/tools/WorkflowSeed -- --dry-run

# Seed vào DB dev (mặc định đọc backend/seed/workflows, tìm từ thư mục hiện tại đi lên)
dotnet run --project backend/tools/WorkflowSeed

# Thư mục khác / DB test / tạo version mới cho workflow đã Publish
dotnet run --project backend/tools/WorkflowSeed -- --dir path/to/seed --database warotrans_test --new-version

# Xuất workflow trong DB ra file seed (bản mới nhất của mỗi mã)
dotnet run --project backend/tools/WorkflowSeed -- --export backend/seed/workflows
```

Tool chỉ chạy trên DB local (`warotrans`, `warotrans_dev`, `*_test`). Không tự chạy khi khởi động backend.

## 5. Sau khi seed: admin làm gì

1. Mở **Configure → Workflows**, mở từng workflow DRAFT.
2. Ở các biến ADMIN_INPUT, chọn giá trị bằng ô chọn: `inspectionEndpointId` = EP-INSPECTION, `inboundEndpointId` =
   EP-INBOUND, `outboundEndpointId` = EP-OUTBOUND, nhóm chỗ đỗ / trạm sạc (có thể để trống).
3. **Publish**. Còn biến bắt buộc chưa điền thì Publish bị từ chối ("ADMIN_INPUT requires configuredValue").

Trước khi Publish, workflow chưa dùng được: không tạo Transport Request, nút Return to park / Go to charger báo
"Publish the workflow … first".

## 6. Luật Publish mới cho ADMIN_INPUT

- Biến ADMIN_INPUT **không bắt buộc** (`isRequired: false`) được để trống khi Publish (ví dụ không chọn nhóm chỗ đỗ: Return
  to park chọn trong mọi điểm PARK).
- Nhưng biến để trống **không được** nối vào input bắt buộc của một step (ví dụ `targetEndpointId` của MOVE): Publish bị
  từ chối ("ADMIN_INPUT 'x' is empty but required input … uses it"), để Job không lỗi lúc chạy.

## 7. Test

- Định nghĩa C# cũ (2 task, không inspection) chuyển thành fixture của integration test
  (`StandardWorkflowFixtures`), để các test về Transport Request không đổi theo file seed.
- Unit: `WorkflowSeedJsonTests` (đọc 5 file seed, bỏ giá trị ADMIN_INPUT, lỗi có số dòng, luật DRAFT, xuất rồi đọc lại),
  2 test luật Publish ADMIN_INPUT. Backend 992 pass.
- Integration `StandardWorkflowSeedTests` sửa theo luật mới và thêm test seed JSON ra DRAFT: **chưa chạy** (xóa DB test).
- Chạy thật trên DB dev: `--dry-run` báo cả 5 workflow `unchanged`; seed bản sao `TMP_SEED_INBOUND` ra v1 DRAFT, Publish
  khi trống bị từ chối, điền 2 điểm rồi Publish được, sau đó xóa bản sao.

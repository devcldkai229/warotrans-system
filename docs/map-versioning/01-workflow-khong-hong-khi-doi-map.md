# Workflow không hỏng khi xuất bản map mới

Ngày: 2026-11-24. Nhánh: `feature/map-version-safe-workflows` (warotrans-system).

## 1. Vấn đề

Workflow lưu điểm đến bằng **ID (GUID) của endpoint hoặc nhóm điểm**. Một ID chỉ thuộc **một** map version:
- biến Admin dạng `WAYPOINT` / `WAYPOINT_GROUP`;
- hằng số `targetEndpointId` của bước MOVE.

Map mới (clone, hoặc dựng từ web) có ID mới, nên workflow cũ sẽ:
- **hỏng giữa chừng**: Job gọi bước MOVE thì gặp "endpoint not on the Job's map";
- **từ chối yêu cầu vận chuyển**: điểm dừng cố định không khớp, báo `workflow_pickup_endpoint_fixed`.

Dữ liệu dev đang gặp đúng chuyện này. Mọi workflow đang publish (INBOUND, OUTBOUND_RETRIEVAL, INTERNAL_RELOCATION, ROBOT_CHARGING, ROBOT_RETURN_TO_PARK) đều được cấu hình bằng điểm của **MAP-ONE-V013**, trong khi map đang chạy là **V019**.

## 2. Cách OTTO làm

Nguồn là tài liệu công khai của OTTO (docs.ottomotors.com, Software 2.36). Họ:
- quản lý map theo version ở ba trạng thái EDITING, LIVE, LOCKED;
- sửa map trên **bản sao của map đang chạy** ("Duplicate for Editing"), hoặc quét lại **một vùng** mà giữ nguyên khung toạ độ (selective remapping);
- dùng **endpoint template** trong thư viện, "đóng dấu" lên map;
- khi publish thì **cảnh báo, chặn** khi có vấn đề, và **không cho đổi map khi còn Job đang chạy**.

WaroTrans làm tương tự, nhưng dùng **mã (code)** làm danh tính không phụ thuộc map, thay cho template.

## 3. Giải pháp

### 3.1 Mã là danh tính của một điểm

- Mã endpoint là `EP-{TÊN}`, sinh từ tên khi tạo và **không đổi được**. Nhóm điểm có mã riêng.
- **Clone map giữ nguyên mã** endpoint và nhóm. Trước đây clone sinh lại mã từ tên hiện tại, nên một endpoint đã đổi tên sẽ ra mã khác.
- Map dựng mới từ web: đặt endpoint **cùng tên** với map cũ thì có cùng mã, workflow tự nhận.
- `INavigationModule.ResolvePlaceOnMapAsync(id, mapVersionId)` dò một ID trên map đích:
  - nếu ID đã nằm trên map đó thì dùng luôn;
  - nếu không thì lấy endpoint hoặc nhóm **cùng mã** trên map đó;
  - nếu map đó không có mã ấy thì trả `Found = false` kèm mã.
- Bản dò nhiều ID một lúc là `ResolvePlacesOnMapAsync`.
- `GET /api/navigation/places/{id}` trả về mã, tên và map version của một ID. Trình sửa workflow dùng API này.

### 3.2 Lúc chạy, điểm được dò theo map của Job

| Chỗ | Thay đổi |
|---|---|
| `JobExecutionEngine`, bước MOVE | Dò `targetEndpointId` (endpoint hoặc nhóm) sang map của Job **trước** khi xử lý nhóm hay điểm phục hồi. Nếu map không có điểm đó thì bước lỗi với mã `workflow_place_not_on_map`, nói rõ mã điểm |
| `JobExecutionEngine`, bước CHECK (`endpointId`) | Dò sang map của Job |
| `RobotCareService` (nhóm đỗ / nhóm sạc) | Dò nhóm sang map của robot. Không có nhóm thì vẫn chọn endpoint theo loại như trước |
| `WorkflowFixedStops` (điểm dừng cố định) | `ResolveOnMapAsync`: điểm dừng cố định được dò sang map của request. `WorkflowRequestValidator` và `GET …/request-input-schema?mapVersionId=` (trang tạo yêu cầu) dùng hàm này |

Không cần sửa dữ liệu workflow, cũng không cần tạo version mới.

### 3.3 Kiểm tra trước khi xuất bản

- `GET /api/navigation/maps/{id}/publish-check` gom kết quả từ mọi module, qua contract `IMapPublishGuard`. Navigation không tham chiếu được các module kia, nên mỗi module tự cài phần kiểm tra của mình.
- `POST …/publish` nhận thêm `{ force, reason }`.

| Module | Mã | Mức | Nội dung |
|---|---|---|---|
| WorkflowExecution | `jobs_running` | **BLOCK, không bỏ qua được** | Còn Job đang thực hiện (ASSIGNED / RUNNING / PAUSED / REASSIGNING / RECOVERY_REQUIRED) trên map cũ |
| WorkflowExecution | `workflow_place_missing` | BLOCK, bỏ qua được | Workflow đã publish cần một điểm (theo mã) mà map mới không có |
| WorkflowExecution | `workflow_group_missing` | WARN | Nhóm ưu tiên không bước nào dùng trực tiếp (nhóm đỗ / nhóm sạc của robot care). Thiếu thì robot chọn endpoint trống cùng loại |
| WorkflowExecution | `workflow_place_unknown` | WARN | Workflow trỏ tới một ID không còn trên map nào |
| WorkflowExecution | `jobs_move_to_new_map` | INFO | Job chưa bắt đầu sẽ chạy trên map mới |
| Transportation | `request_place_missing` | BLOCK, bỏ qua được | Yêu cầu chưa chạy dùng endpoint mà map mới không có |
| Transportation | `requests_move_to_new_map` | INFO | Yêu cầu chưa chạy sẽ chuyển sang map mới |
| Fleet | `robots_on_old_map` | WARN | Robot còn gán map cũ: sau khi publish thì chuyển sang map mới và định vị lại |
| Fleet | `robot_home_missing` | WARN | Điểm nhà (`Traffic:RobotHomeEndpoints`) của robot không có trên map mới |

**Quy tắc khi bấm xuất bản:**
- Không có BLOCK: xuất bản luôn.
- Chỉ có BLOCK bỏ qua được: phải bấm "Vẫn xuất bản" kèm **lý do** (từ 5 ký tự). Lý do được ghi log và audit.
- Có BLOCK không bỏ qua được: từ chối với mã `map_publish_blocked`.

Mỗi mục kiểm tra có `args`, nên web dựng được câu tiếng Việt theo `code`.

### 3.4 Sau khi xuất bản (`IMapPublishFollower`)

- **Yêu cầu vận chuyển chưa chạy** (SUBMITTED, hoặc QUEUED mà Job chưa bắt đầu): đổi `MapVersionId` và endpoint nguồn/đích sang map mới, dò theo mã.
- **Job chưa bắt đầu** (CREATED / QUEUED): đổi `MapVersionId`. Các điểm trong Job được dò theo mã khi từng bước chạy.
- **Ô lưu trữ**: vẫn đi theo endpoint mới bằng lineage, như trước.
- Một follower lỗi thì chỉ ghi log, không huỷ lần publish. Các mục còn sót sẽ hiện lại ở lần kiểm tra sau.

### 3.5 Web

- **Hộp "Xuất bản MAP-…"** dùng ở cả trình chỉnh map lẫn trang Facility. Hộp liệt kê ba nhóm: *Sẽ hỏng* (đỏ), *Cần lưu ý* (vàng), *Hệ thống tự làm* (xanh), kèm ô lý do và nút "Vẫn xuất bản".
- **Trình sửa workflow:** giá trị chọn từ map cũ hiện là "EP-INSPECTION · Inspection · WAYPOINT (chọn trên MAP-ONE-V013; dùng điểm cùng mã trên map đang xuất bản)", thay vì "ID không xác định". Nếu map đang publish thiếu mã đó thì ô báo rõ cần thêm điểm nào.
- **Trình chỉnh map:**
  - header chỉ còn **Đóng** và **Xuất bản**, hoặc "Nhân bản để sửa" với map không phải nháp;
  - **Nhóm điểm** nằm trên thanh công cụ cạnh Endpoint / Đường / Vùng;
  - bỏ các nút kiểm tra topo, xuất route graph cũ, SVG gỡ lỗi, xoá cache đồ thị.

## 4. Các file chính

| File | Nội dung |
|---|---|
| `Navigation/Contracts/INavigationModule.cs` | `ResolvePlaceOnMapAsync`, `ResolvePlacesOnMapAsync`, `MapPlaceResolution` |
| `Navigation/Contracts/MapPublishContracts.cs` | `MapPublishContext`, `MapPublishIssue`, `IMapPublishGuard`, `IMapPublishFollower` |
| `Navigation/Services/NavigationModuleApi.cs` | Bộ dò theo mã |
| `Navigation/Features/PublishMapVersion/MapPublishCheck.cs`, `Handler.cs`, `Endpoint.cs` | Kiểm tra, chặn và bỏ qua, follower, `publish-check` |
| `Navigation/Features/CloneMapVersion/Handler.cs` | Clone giữ nguyên mã endpoint |
| `Navigation/Features/GetPlace/GetPlaceEndpoint.cs` | `GET /places/{id}` |
| `WorkflowExecution/Services/WorkflowMapPublish.cs` | `WorkflowPlaces.Collect`, guard và follower của workflow / Job |
| `WorkflowExecution/Execution/JobExecutionEngine.cs`, `Features/RobotCare/RobotCareService.cs`, `Services/WorkflowFixedStops.cs`, `WorkflowRequestValidator.cs`, `Features/GetWorkflowRequestInputSchema/*` | Dò điểm theo map khi chạy |
| `Transportation/Features/Shared/TransportMapPublish.cs` | Guard và follower của yêu cầu vận chuyển |
| `Fleet/Features/ChangeRobotMap/FleetMapPublishGuard.cs` | Cảnh báo về robot |
| Web: `features/maps/PublishMapDialog.tsx`, `features/workflows/EndpointValuePicker.tsx`, `endpointOptions.ts`, `MapEditorPage.tsx`, `FacilityPage.tsx`, `shared/api/navigation.ts`, `shared/api/workflows.ts` | Giao diện |

## 5. Chưa làm (theo plan)

- **Phase 5, công cụ căn map:** chép nhanh endpoint, zone, lane từ map cũ sang một map dựng mới, có biến đổi toạ độ. Hiện tại chỉ cần đặt endpoint cùng tên trên map mới là workflow tự nhận; công cụ căn map chỉ giúp đặt đúng chỗ nhanh hơn.
- **Phase 6:** dựng map tiếp từ pose graph của map đang dùng, giữ nguyên toạ độ. Cần thử trên robot thật.

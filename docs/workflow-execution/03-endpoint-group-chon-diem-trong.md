# Endpoint Group: robot tới điểm còn trống trong một nhóm

Tài liệu giải thích thay đổi ngày 21/11/2026. Trước đây "Return to park" / "Go to charger" chọn trong **mọi** điểm loại
PARK / CHARGER, và workflow chỉ trỏ được tới **một** điểm cố định. Nay một workflow có thể trỏ tới một **nhóm điểm**
(Endpoint Group), và robot đi tới điểm còn trống trong nhóm.

## 1. Endpoint Group

Một nhóm điểm trên một bản đồ (đã có từ commit `b25ea73`, nay mới được dùng):

| Trường | Ý nghĩa |
|---|---|
| `code`, `name` | Ví dụ `PARKING` · Parking places |
| `selection_policy` | `NEAREST`: điểm trống gần robot nhất. `FIRST_AVAILABLE`: điểm trống đầu tiên theo mã điểm |
| `is_active` | Nhóm ngừng dùng thì không được chọn |
| Thành viên | Các điểm cùng bản đồ |

Nhóm chỉ sửa được trên bản đồ **DRAFT** và được publish cùng bản đồ. "Clone & edit" chép cả nhóm sang bản mới.

**Giao diện:** trang sửa bản đồ có nút **Nhóm điểm** (Endpoint groups): xem các nhóm; trên bản đồ DRAFT thì tạo, sửa
(tên, cách chọn, ngừng dùng, chọn điểm thành viên) và xóa.

**DB dev:** đã tạo sẵn trên MAP-ONE-V013 (ghi thẳng bằng SQL vì bản đồ đang PUBLISHED):
- `PARKING` (NEAREST): EP-PARKING-A, EP-PARKING-B
- `CHARGING` (NEAREST): EP-CHARGE

## 2. "Còn trống" nghĩa là gì

Dùng chung một chỗ (`FreeEndpointSelector`), giống hệt logic cũ của `ChooseFreeEndpointAsync`. Một điểm bị loại khi:
- điểm đang tắt;
- có robot khác đứng trong bán kính `FleetIdle:OccupiedRadiusMeters` (0.30 m) hoặc dung sai của điểm;
- có robot khác đang tự chạy về đó (FL-08, tự về chỗ đỗ);
- có Job khác đang sống nhắm tới đó: Job chăm sóc robot (giá trị `...EndpointId` trong context) hoặc bước MOVE đang
  `WAITING` / `EXECUTING` có đích là điểm đó.

## 3. Workflow dùng nhóm

### Loại biến WAYPOINT_GROUP

Ô **Type** của biến có thêm **WAYPOINT_GROUP (điểm trống bất kỳ trong nhóm)**. Lưu xuống: `dataType = UUID`,
`format = WAYPOINT_GROUP`, giá trị là **UUID của nhóm**. Ô "Configured value" thành danh sách nhóm của bản đồ đang
PUBLISHED, ví dụ `PARKING · Parking places · NEAREST · EP-PARKING-A, EP-PARKING-B`.

### Hai cách dùng

1. **Bước MOVE trỏ thẳng vào biến nhóm** (`targetEndpointId` ← biến WAYPOINT_GROUP). Khi bước bắt đầu
   (`JobExecutionEngine.ResolveEndpointGroupAsync`):
   - chọn một điểm trống theo cách chọn của nhóm, ghi vào output của bước (`endpointGroupId`, `selectedEndpointId`) để
     lần thử lại đi đúng điểm cũ; log `Job … step …: group PARKING → EP-PARKING-A`;
   - không còn điểm trống: bước **chờ** (`WAITING`, "a free place in PARKING") và thử lại sau 2 s, không báo lỗi;
   - nhóm ngừng dùng hoặc ở bản đồ khác: bước lỗi `endpoint_group_unavailable`;
   - output `arrivedEndpointId` là điểm thực sự đã tới, bước sau có thể dùng.
2. **Return to park / Go to charger** (`RobotCareService`): nếu workflow `ROBOT_RETURN_TO_PARK` /
   `ROBOT_CHARGING` đang PUBLISHED có biến ADMIN_INPUT loại WAYPOINT_GROUP đã chọn nhóm (cùng bản đồ với robot, đang
   dùng), các điểm ứng viên là thành viên nhóm. Không có thì như cũ: mọi điểm PARK / CHARGER. Điểm chọn được truyền vào
   `parkEndpointId` / `chargerEndpointId` như trước, nên gọi API kèm `{ "endpointId": ... }` vẫn đi đúng điểm đó.

**DB dev (ghi đè v1):** `ROBOT_RETURN_TO_PARK` có `parkEndpointGroupId` = PARKING; `ROBOT_CHARGING` có
`chargerEndpointGroupId` = CHARGING.

Biến nhóm không bị coi là "điểm cố định" của Transport Request (`WorkflowFixedStops` bỏ qua WAYPOINT_GROUP).

## 4. Kiểm thử

- Unit: `FreeEndpointSelectorTests` (NEAREST, FIRST_AVAILABLE, bỏ điểm có robot / đã có Job nhắm tới, hết chỗ); test
  `format` WAYPOINT_GROUP. Backend 984 pass; web 242 pass, tsc sạch.
- Gazebo, RBT-001:
  - Go to charger → nhóm CHARGING chọn EP-CHARGE, robot tới, xác nhận cắm sạc, Job COMPLETED.
  - Return to park với bước MOVE trỏ thẳng vào nhóm PARKING → engine ghi `group PARKING → EP-PARKING-A`, robot về
    Parking A, Job COMPLETED. (Thử xong đã trả binding về `parkEndpointId`.)
  - Return to park bình thường → RobotCare chọn EP-PARKING-A từ nhóm, Job COMPLETED.
  - Các Job thử nghiệm đã được xóa khỏi DB dev.
- Web: panel Nhóm điểm hiện 2 nhóm của V013; ô chọn WAYPOINT_GROUP liệt kê đúng 2 nhóm; màn xem workflow hiện tên nhóm.
  Chưa thử tạo/sửa nhóm trên giao diện (cần một bản đồ DRAFT); API tạo/sửa nhóm đã có test từ trước.

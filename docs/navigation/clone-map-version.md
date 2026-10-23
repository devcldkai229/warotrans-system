# Clone map version: sửa map đã publish thông qua một bản DRAFT

> Nhánh `feature/clone-map-version` (từ `develop` f2cf4d2) · 2026-10-21.

## 1. Vấn đề

Chỉ map **DRAFT** mới thêm, sửa, xóa được endpoint, zone, edge. Map **PUBLISHED** và **ARCHIVED** chỉ đọc. Trước đây,
muốn đổi một map đang chạy thì phải import lại map.yaml + map.pgm thành một DRAFT trống rồi vẽ lại toàn bộ.

## 2. API

```
POST /api/navigation/maps/{id}/clone        body: { "name": null | "<tên>" }        → 201 MapVersionResponse (DRAFT)
```

`CloneMapVersionHandler`:

| Phần | Cách copy |
|---|---|
| MapVersion mới | `DRAFT`, `VersionNo` = lớn nhất của kho + 1, code `MAP-<WH>-V<nnn>` (bộ sinh code hệ thống), tên mặc định "Copy of …", `SourceMapVersionId` = map nguồn |
| Ảnh map | **Dùng lại** `MapUri`, `MapYamlUri`, `PreviewImageUri` và giữ nguyên thông số ảnh (resolution, origin, kích thước, ngưỡng, content hash). Kho file không bao giờ xóa file nên dùng chung được. |
| Endpoint | id mới, code từ `NextEndpointCodeAsync(name)`, copy tên / loại / x,y,yaw / dung sai / enabled. `SourceEndpointId` = endpoint nguồn |
| Zone | id mới, code từ `NextZoneCodeAsync(name)`, copy polygon / capacity / maxSpeed / policy / active |
| Edge | id mới, code từ `NextEdgeCodeAsync()`, copy LineString / độ rộng / chiều / capacity / maxSpeed / active |
| Endpoint group | id mới, giữ code (group không có bộ sinh code), thành viên trỏ sang id endpoint mới |

**Code không bao giờ copy.** Code luôn lấy từ bộ sinh code của hệ thống, giống như khi tạo mới:

- endpoint `EP-{TÊN}` và zone `ZONE-{TÊN}`: sinh theo tên, chỉ cần unique **trong một map**. Vì vậy endpoint cùng tên
  ra lại cùng code, ví dụ `EP-SHELF-01`;
- edge `EDGE-nnn`: bộ đếm toàn hệ thống, nên luôn ra số mới.

Map nguồn không thay đổi gì. Map chưa có ảnh thì clone bị từ chối: 400 `map_assets_pending`.

## 3. Storage location đi theo khi publish

Storage location (module Warehouse) trỏ vào `endpoint_id`. Bản clone cấp id mới cho endpoint, nên nếu không xử lý thì
sau khi publish bản clone, mọi request vào kệ sẽ lỗi "StorageLocation is bound to a different Endpoint".

Khi publish, `PublishMapVersionHandler`:

1. Archive map đang published (như cũ) và publish map mới.
2. Lập bảng **endpoint tổ tiên → endpoint mới** theo `SourceEndpointId`. Bảng đi ngược qua nhiều đời clone (clone
   của clone…, tối đa 32 đời), nên clone V014 từ V013, rồi V015 từ V014 chưa publish, vẫn kéo được storage location
   đang trỏ vào endpoint của V013.
3. Gọi `IStorageLocationEndpointRebinder.RebindAsync(warehouseId, map)`. Đây là contract mới của Warehouse; Navigation
   vốn đã phụ thuộc `Warehouse.Contracts`, nên không cần integration event.

Endpoint thêm mới trong DRAFT không có nguồn, nên không ảnh hưởng gì. Endpoint nguồn bị xóa trong DRAFT thì storage
location của nó **giữ nguyên** và vẫn trỏ vào endpoint cũ (đã archived). Cần tạo lại storage location đó trên web.

## 4. Database

Migration `AddMapVersionCloneSource` (Navigation) thêm hai cột nullable:

- `navigation.map_versions.source_map_version_id`;
- `navigation.endpoints.source_endpoint_id`, có index.

`GET /maps/{id}/detail` trả thêm `sourceMapVersionId` và `sourceMapVersionCode`.

## 5. Web

- **Configure → Facility**: mỗi map version có ảnh đều có nút **Clone to draft**. Bấm xong mở luôn Map Editor của bản
  DRAFT mới.
- **Map Editor**: map chỉ đọc có nút **Clone & edit** thay cho Publish. Bản clone có dòng "Cloned from MAP-…".

## 6. Test

Integration test `Navigation/Maps/CloneMapVersionTests` (Postgres thật):

| Test | Kiểm tra |
|---|---|
| `Clone_copies_the_map_into_an_editable_draft_with_new_codes` | DRAFT mới, version + 1, cùng ảnh; endpoint / zone / edge id mới; code theo bộ sinh (`EP-SHELF-01`, `ZONE-SHELF-AREA`, `EDGE-nnn` mới); map nguồn không đổi; DRAFT thêm endpoint được |
| `Publishing_the_clone_moves_storage_locations_to_the_copied_endpoints` | Khi còn DRAFT thì chưa đổi gì; publish thì storage location chuyển sang endpoint mới, map nguồn ARCHIVED |
| `A_clone_of_a_clone_still_carries_the_storage_location` | Clone 2 đời, publish đời 2 → storage location đi theo |
| `Clone_needs_the_map_image` | 400 `map_assets_pending` |

Toàn bộ integration test Navigation và StorageLocation: 55/55 pass. Unit test: 311/311 pass.

## 7. Lưu ý khi chạy trên DB dev

`develop` đã có migration `RemapZoneAndEndpointTypes` của đồng đội. Migration này đổi loại endpoint (STORAGE / INBOUND /
OUTBOUND… → WAYPOINT; CHARGING → CHARGER; PARKING → PARK) và loại zone (OPERATIONAL_AREA → SPEED, …). Backend
Development tự migrate khi khởi động, nên lần chạy đầu trên nhánh này sẽ đổi luôn các loại đó trong DB dev.

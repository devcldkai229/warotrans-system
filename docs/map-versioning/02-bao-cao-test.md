# Báo cáo test: workflow không hỏng khi đổi map (2026-11-24)

## 1. Test tự động

| Phần | Kết quả |
|---|---|
| Backend unit (`dotnet test WaroTrans.UnitTests`) | 1173 passed, 3 skipped. Mới: `Navigation/MapPlacesTests.cs` (4), `WorkflowExecution/Services/WorkflowPlacesTests.cs` (3) |
| Backend architecture | 16 passed |
| Web (`tsc -b`, `oxlint`, `vitest run`) | Sạch, 299 passed |

Integration test chưa chạy, vì chúng xoá DB test.

Nội dung test mới:
- Bộ dò theo mã:
  - điểm cùng mã trên map khác thì dò ra được;
  - điểm đã nằm trên map đó thì giữ nguyên;
  - map không có mã thì trả `Found = false` kèm mã;
  - nhóm điểm cũng dò theo mã;
  - ID lạ thì bị bỏ qua.
- Xuất bản:
  - Job đang chạy thì chặn, kể cả khi `force`;
  - thiếu điểm thì cần `force` kèm lý do, rồi follower mới chạy (với đúng map cũ và map mới);
  - chỉ có cảnh báo thì xuất bản luôn.
- `WorkflowPlaces.Collect`:
  - lấy biến Admin `WAYPOINT` / `WAYPOINT_GROUP` / `*EndpointId` và hằng số `*EndpointId` của bước;
  - nhóm đỗ không bước nào dùng trực tiếp thì đánh dấu là "ưu tiên".
- `WorkflowFixedStops.ResolveOnMapAsync`:
  - điểm dừng cố định cấu hình trên map cũ thì ra endpoint cùng mã trên map của request;
  - map không có thì báo `workflow_place_not_on_map`.

## 2. Thử trên dữ liệu dev (không xuất bản thật)

Bài thử chạy bản build mới ở cổng 5091 (không MQTT), trên DB dev. Map đang chạy là MAP-ONE-V019, và bài thử **không** thay map này.

| Bước | Kết quả |
|---|---|
| Các điểm mà workflow đang publish trỏ tới | 5 điểm, **đều thuộc MAP-ONE-V013**: EP-INSPECTION, EP-INBOUND, EP-OUTBOUND, nhóm CHARGING, nhóm PARKING |
| Clone V019 thành V025 | Mã của 12 endpoint giữ nguyên |
| Kiểm tra bản clone chưa sửa | `canPublish = true`. Chỉ có cảnh báo: 2 robot còn ở V019, nhóm PARKING và CHARGING không có trên map (V019 cũng không có). Workflow INBOUND / OUTBOUND / INTERNAL tự dùng điểm cùng mã trên map mới |
| Xoá EP-INSPECTION khỏi bản clone rồi kiểm tra | 3 BLOCK `workflow_place_missing` (INBOUND, OUTBOUND_RETRIEVAL, INTERNAL_RELOCATION), `canOverride = true` |
| Xuất bản mà không `force` | 409 `map_publish_needs_confirmation` |
| Dọn dẹp | Các bản clone thử V024, V025, V026 đã được archive |

**Phát hiện trên dữ liệu thật:**
- Trước thay đổi này, các workflow INBOUND, OUTBOUND và INTERNAL chạy trên V019 sẽ hỏng ở bước tới điểm kiểm tra, vì điểm của V013 không thuộc map của Job.
- V019 không có nhóm PARKING và CHARGING. Robot care vẫn chạy được, vì tự chọn endpoint theo loại.

## 3. Giao diện

Ảnh trong `test-20261124/`:
- `1-kiem-tra-truoc-khi-xuat-ban.png`: hộp "Xuất bản MAP-ONE-V026", gồm 3 mục "Sẽ hỏng", 3 mục "Cần lưu ý", ô lý do và nút "Vẫn xuất bản".
- `2-workflow-diem-tu-map-cu.png`: workflow INBOUND hiển thị điểm chọn trên MAP-ONE-V013 kèm ghi chú "dùng điểm cùng mã trên map đang xuất bản".
- `3-thanh-cong-cu-nhom-diem.png`: trình chỉnh map với header chỉ còn Đóng / Xuất bản, có "Nhóm điểm" trên thanh công cụ và panel tạo nhóm.

## 4. Chưa thử

- Xuất bản thật một map mới rồi chạy Job trên Gazebo. Bài này sẽ thay map đang chạy (V019) của DB dev, nên cần bạn đồng ý trước.
- Phase 5 (công cụ căn map) và Phase 6 (dựng tiếp từ pose graph) chưa làm.

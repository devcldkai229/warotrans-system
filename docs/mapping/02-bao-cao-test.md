# Báo cáo test: dựng map từ web (2026-11-24)

## 1. Test tự động

| Phần | Lệnh | Kết quả |
|---|---|---|
| Robot `warotrans` (`warotrans_fleet`) | `python -m pytest test` (Windows và WSL) | 445 passed, 4 skipped. Mới: `test_mapping_session.py` (10) |
| Robot `warotrans-rbt2` (`warotrans_fleet` sau khi sync) | `python -m pytest test` | 444 passed, 5 skipped |
| Robot `warotrans-rbt2` (`warotrans_rbt002_bringup`) | `python3 -m pytest` (WSL) | 5 passed |
| Backend unit | `dotnet test WaroTrans.UnitTests` | 1157 passed, 3 skipped. Mới: `Fleet/MappingTests.cs` (13) |
| Backend architecture | `dotnet test WaroTrans.ArchitectureTests` | 16 passed |
| Web | `pnpm exec tsc -b`, `oxlint`, `vitest run` | Sạch (file mới không có cảnh báo), 290 passed. Mới: `mappingGrid.test.ts` (6) |

**Integration test của backend chưa chạy**, vì chúng xoá DB test.

## 2. Trọn luồng: web / API → backend → MQTT → robot Gazebo

**Môi trường:**
- Gazebo một robot (`sim_bringup.launch.py`, world kho mặc định, RBT-001).
- Gateway cấu hình **giống robot thật ở chế độ fleet**: `teleop_enabled: false`, `cmd_vel_topic: cmd_vel_safe`, có `cmd_vel_authority_gate`.
- Backend build mới, migration `AddMappingSessions` đã áp lên DB dev.
- `FleetIdle:AutoReturnToPark` tắt trong lúc thử, để backend không tự gửi robot về bãi đỗ.

| # | Bài | Kết quả |
|---|---|---|
| 1 | Dựng map qua MQTT trực tiếp (chưa có backend), 3 phiên | Đạt. PAUSE/RESUME localization, slam_toolbox bật và tắt không sót tiến trình, map gửi về khớp sha256, pose graph được lưu trên robot |
| 2 | API, nhánh **lưu** | START → MAPPING trong 9,5–12 s. Bắt đầu phiên thứ hai trên cùng robot: 409 `mapping_session_open`. Trong lúc dựng map, robot báo `MAPPING` / `UNKNOWN`; AUTO_LOCALIZE bị từ chối 409 `robot_mapping`. Lái tay qua lease: 103/103 lệnh được nhận. Hoàn tất → **COMPLETED, MAP-ONE-V022 DRAFT** (đúng tên, 63 × 99, 0,05 m, có ảnh preview, có diện tích và `robotPath`). Sau phiên, robot báo UNKNOWN và lại được phép dựng map |
| 3 | API, nhánh **huỷ** | CANCELLING → CANCELLED. Không tạo map nào. Robot trở lại map cũ, báo UNKNOWN |
| 4 | **Giao diện web** (Playwright, tiếng Việt) | Facility → **Dựng map** → chọn RBT-001 → trang dựng map (MAPPING sau 8 s) → lái bằng phím mũi tên → map và vệt đường hiện dần (4,8 m², 0:23) → nhập tên → **Hoàn tất và lưu** → tự mở **MAP-ONE-V023 (Nháp)** trong trình chỉnh map. Không có lỗi trang hay lỗi console |

Ảnh chụp:
- `test-20261124/1-chon-robot.png`: hộp chọn robot (RBT-002 bị khoá vì offline);
- `test-20261124/2-dang-dung-map.png`: trang dựng map;
- `test-20261124/3-map-draft-trong-editor.png`: map nháp mở trong trình chỉnh map.

### Lỗi gặp và đã sửa trong lúc test

- **Phiên COMPLETED thiếu diện tích và `robotPath`.**
  - Nguyên nhân: chunk cuối của map về trước kết quả STOP, làm phiên đóng sớm, nên kết quả STOP tới sau không còn được ghi vào phiên.
  - Cách sửa: robot gửi kèm `knownAreaM2` và `robotPath` trong mỗi chunk, backend lưu hai giá trị này khi import. Đã có test ở cả hai phía.
- **Gazebo đã chạy khoảng 11 tiếng (máy có lúc ngủ) thì START báo `MAPPING_NO_MAP`.**
  - Lúc đó map_server và costmap filters đã sập vì mất heartbeat. Đây là môi trường mô phỏng hỏng, không phải lỗi code.
  - Gateway vẫn làm đúng: báo FAILED và trả lại localization. Khởi động lại Gazebo thì chạy bình thường.

## 3. Giới hạn của bài thử

- World mô phỏng chỉ rộng khoảng 3,5 × 5 m và robot xuất phát trong ô đỗ hẹp, nên mỗi phiên chỉ quét được khoảng 3–5 m². Drive Assist chặn robot đúng khi gặp tường.
- **Chưa thử trên robot thật** (RBT-001 và RBT-002). Cần deploy `warotrans_fleet` mới, có người giám sát cạnh robot.
- Các map nháp tạo ra trong lúc thử vẫn còn trong DB dev: MAP-ONE-V021, V022, V023.

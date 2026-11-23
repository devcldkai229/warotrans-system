# Báo cáo test: đổi map và tự định vị (2026-11-23)

## 1. Test tự động

| Phần | Lệnh | Kết quả |
|---|---|---|
| Robot `warotrans_fleet` | `python -m pytest test` | 435 passed, 4 skipped. Mới: `test_scan_match_localizer.py` (9), `test_auto_localize.py` (7) |
| Backend unit | `dotnet test WaroTrans.UnitTests` | 1144 passed, 3 skipped. Mới: `Fleet/AutoLocalizeTests.cs` (8) |
| Backend architecture | `dotnet test WaroTrans.ArchitectureTests` | 16 passed |
| Web | `pnpm exec tsc -b`, `oxlint`, `vitest run` | Sạch, 284 passed. Mới: `robotMaps.test.ts` |

Integration test của backend **chưa chạy**, vì chúng xoá sạch DB test.

## 2. So khớp trên map thật MAP-ONE-V019 (không chạy ROS)

Map lấy từ `map_one_v019/map.pgm`. Ứng viên là cả 12 endpoint. Robot giả đặt lệch 7 cm / 5 cm và 11° so với từng endpoint.

| Robot đứng ở | Kết quả | Sai số vị trí | Điểm | Cách biệt | Thời gian |
|---|---|---|---|---|---|
| EP-CHARGE | MATCHED EP-CHARGE | 1,1 cm | 0,93 | 0,25 | 2,3 s |
| EP-INBOUND | MATCHED EP-INBOUND | 2,3 cm | 0,95 | 0,21 | 2,1 s |
| EP-INSPECTION | MATCHED | 3,0 cm | 0,95 | 0,30 | 1,8 s |
| EP-OUTBOUND | MATCHED | 3,2 cm | 0,92 | 0,21 | 1,9 s |
| EP-PARKING-A | MATCHED | 0,5 cm | 0,94 | 0,35 | 2,0 s |
| EP-PARKING-B | MATCHED | 4,3 cm | 0,90 | 0,38 | 1,9 s |
| EP-QUEUE-A | MATCHED | 0,5 cm | 0,96 | 0,29 | 1,8 s |
| EP-QUEUE-B | MATCHED | 3,2 cm | 0,89 | 0,37 | 1,9 s |
| EP-SHELF-A-1 | MATCHED | 0,5 cm | 0,96 | 0,27 | 1,9 s |
| EP-SHELF-A-2 | MATCHED | 2,5 cm | 0,95 | 0,21 | 1,9 s |
| EP-SHELF-B-01-02 | MATCHED | 2,5 cm | 0,95 | 0,18 | 1,9 s |
| EP-SHELF-C-1 | MATCHED | 5,1 cm | 0,92 | 0,29 | 1,9 s |

Ở lần chạy đầu, tên endpoint đôi khi bị gán sang endpoint bên cạnh (EP-CHARGE ra EP-PARKING-A). Đã sửa để tên luôn lấy theo endpoint gần nhất. Bảng trên là kết quả sau khi sửa.

## 3. Gazebo (world `map_one_v013`, robot sim01 = RBT-001)

Gazebo chỉ có world V013, còn DB đang dùng V019 làm map PUBLISHED. Để không phải sửa DB, bài thử này **dừng backend** và gửi lệnh `AUTO_LOCALIZE` thẳng qua MQTT broker, với ứng viên là các endpoint của `samples/maps/MAP-ONE-V013`. Script: `al_mqtt.py`. Pose thật lấy từ `gz model -p`.

| # | Tình huống | Kết quả robot trả về | So với thực tế |
|---|---|---|---|
| A | Robot ở EP-PARKING-A, đang định vị đúng | SUCCEEDED, CANDIDATE_MATCH, EP-PARKING-A, khớp 0,88, cách biệt 0,27, 6,0 s | Lệch 2,5 cm so với AMCL |
| B | "Bắt cóc": đặt AMCL tin robot ở (1,30; 1,10), robot thật vẫn ở Parking A | SUCCEEDED, CANDIDATE_MATCH, EP-PARKING-A, 3,7 s. Pose sau đó (−0,627; −0,791) | Đúng Parking A |
| C1 | Dịch robot (set_pose) tới (1,0; 0,0; 28°), không gần endpoint nào, chưa cho xoay | FAILED `LOCALIZATION_NO_MATCH`, không nhận pose nào. Gợi ý số 1 (GLOBAL): (1,033; 0,034; 30°), khớp 0,90 | Gợi ý lệch 4,7 cm, đúng như thiết kế |
| C2 | Dịch robot tới (1,7; −0,4), **cho phép xoay** | SUCCEEDED, GLOBAL_SPIN, 26,8 s. Pose (1,613; −0,372; 2,474 rad) | Thật (1,683; −0,405; 2,482 rad): lệch 7,8 cm, 0,5° |

## 4. Kiểm tra API (backend thật, robot không ở trạng thái rảnh)

- `GET /api/fleet/robots/{id}/auto-localize` khi chưa chạy lần nào: trả về `state: NONE`.
- `POST …/commands/auto-localize` khi robot đang chạy NAVIGATE: trả về 409 `robot_busy`.
- `POST …/commands/localize` với body rỗng: trả về 400 `localize_target_required`.
- Migration `AddRobotCommandResultJson` đã áp lên DB dev, cột `fleet.robot_commands.result_json` có tồn tại.

## 5. Giao diện

`test-20261123/1-change-map.png`: khung Đổi bản đồ. `test-20261123/2-localize.png`: khung Định vị lại, gồm phần Tự định vị (ô cho phép xoay) và phần chọn tay endpoint.

## 6. Chưa làm được

- **Trọn luồng web → backend → robot trên Gazebo.** Cần tạm cho V013 làm map PUBLISHED (Gazebo chỉ có world V013). Lệnh sửa DB đó bị chặn, nên phần backend và web được kiểm bằng unit test và gọi API, phần robot được kiểm trên Gazebo qua MQTT. Muốn chạy trọn luồng thì cần một world Gazebo cho V019, hoặc bạn cho phép tạm đổi trạng thái map.
- **slam_toolbox localization chưa chạy thật,** vì chưa có pose graph. Mới kiểm được launch báo lỗi rõ khi thiếu pose graph, và tham số `localizer` / `slam_posegraph` hiện trong `--show-args`.
- Robot thật chưa thử.

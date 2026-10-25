# samples/maps: map đã setup trên web, để cả team dùng chung

Mỗi thư mục là một map version được chụp lại từ DB, kèm theo các file ảnh map:

| Thư mục | Nội dung |
|---|---|
| `MAP-WHSIM-V018/` | Kho mô phỏng `WH-SIM`, map `warotrans_map3` (SLAM sàn demo thật, 107 × 68 px @ 0.05 m): 11 endpoint, 13 lane, 12 zone (Junction / No-stop / Single-occupancy…), 5 kệ |

Trong mỗi thư mục có:
- `snapshot.json`: các dòng `navigation.map_versions`, `endpoints`, `edges`, `zones`, `endpoint_groups` (+ members). Id và mã được giữ nguyên.
- `map.pgm`, `map.yaml`, `map-preview.png`: ảnh map đã upload trên web.

## Nhập map vào máy của bạn

Cần có Docker (`infrastructure/docker compose up -d`) và DB đã migrate (chạy backend một lần).

```powershell
powershell -ExecutionPolicy Bypass -File samples/maps/import-map-snapshot.ps1 -Snapshot samples/maps/MAP-WHSIM-V018
```

Script làm các việc sau, chạy lại nhiều lần được:
- tạo kho `WH-SIM` nếu chưa có;
- ghi map ở trạng thái **PUBLISHED**, map PUBLISHED cũ của kho chuyển sang ARCHIVED;
- chép ảnh map vào `backend/src/WaroTrans.Host/data/maps/…`;
- nếu đã đăng ký robot `RBT-SIM-01` (`samples/simulation/seed-sim.ps1`) thì chuyển robot sang map này và ghi `samples/simulation/sim-config.json`.

Nếu DB của bạn đã có một map khác mang số `V018`, map sẽ được nhập với số kế tiếp (ví dụ `MAP-WHSIM-V019`) và script in ra thông báo.

Sau đó, với Gazebo (repo robot, trong WSL):

```bash
cd ~/warotrans_ws/src/warotrans_simulation
python3 scripts/sync_web_map.py --map-id 7cb001f7-cbf3-4f3e-8400-fddc00d63b19 --user admin --password '<mật khẩu>'
```

## Cập nhật snapshot sau khi sửa map trên web

```powershell
powershell -ExecutionPolicy Bypass -File samples/maps/export-map-snapshot.ps1 -MapCode MAP-WHSIM-V0NN
```

Lệnh tạo thư mục `samples/maps/MAP-WHSIM-V0NN/`; commit thư mục đó cùng code.

Cả hai script nhận `-Database <tên>` (mặc định `warotrans`) và `-Container <tên>` (mặc định `warotrans-postgres`).

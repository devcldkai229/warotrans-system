# Internal relocation: robot ảo chuyển container từ kệ này sang kệ kia

> Trạng thái: **XONG trên Gazebo** (2026-10-16), nhánh `feature/simulation-internal-relocation`.
> Kết quả: `REQ-20261016-000003` (3 container) → `JOB-20261016-000003` chạy **17/17 bước trong 92 s** trên robot ảo.
> Job `COMPLETED`, TransportRequest `COMPLETED`, cả 3 Detail `COMPLETED`.
> Trước đó: [GĐ 3 job engine](03-job-engine-robot-ao.md) (inbound put-away), [web theo dõi job](04-web-theo-doi-job.md).

## 1. Kịch bản

Workflow `INTERNAL_RELOCATION` (`samples/workflows/INTERNAL_RELOCATION.request.json`) di chuyển container **đang nằm trên
kệ** sang **kệ khác** trong cùng kho:

| Container | Từ | Đến |
|---|---|---|
| `CTN-RL-000001` | Rack A (`LOC-SIM-A`) | Rack C (`LOC-SIM-C`) |
| `CTN-RL-000002` | Rack A (`LOC-SIM-A`) | Rack C (`LOC-SIM-C`) |
| `CTN-RL-000003` | Rack B (`LOC-SIM-B`) | Rack A (`LOC-SIM-A`) |

Planner gom các điểm dừng: **PICKUP A [1,2] → PICKUP B [3] → DROPOFF C [1,2] → DROPOFF A [3]**. Robot đi từ PARK vào lối
trước kệ A, sang kệ B, sang kệ C, rồi vòng phía bắc các kệ về lại kệ A. Như vậy robot phải qua nhiều ngã 3 giữa các kệ.

Mỗi thùng có các bước:
- **Task PICKUP** (tại kệ nguồn):
  - CHECK robot sẵn sàng, pin tối thiểu, request còn active, kệ nguồn trống;
  - MOVE `PICKUP`;
  - HUMAN `PICKUP_CONFIRM`: nhân viên quét thùng trên kệ, lấy xuống đặt lên robot, rồi xác nhận.
- **Task DELIVERY** (tại kệ đích):
  - CHECK kệ đích trống;
  - MOVE `DROPOFF`;
  - HUMAN `DROPOFF_CONFIRM`: nhân viên lấy thùng khỏi robot, cất lên kệ đích, rồi xác nhận.

Khi nhiều thùng chung một điểm dừng, robot chỉ đi đến đó một lần; mỗi thùng vẫn có một lần xác nhận riêng. Vì vậy job có
17 bước chứ không phải 3 × 9 = 27.

## 2. Khác inbound ở đâu

| | `INBOUND_PUTAWAY` | `INTERNAL_RELOCATION` |
|---|---|---|
| Container lúc đầu | `PACKED`, ở cửa nhập, không có kệ | `STORED`, **có `current_storage_location_id`** (đang nằm trên kệ) |
| Nguồn của Detail | endpoint inbound | endpoint kệ + `sourceStorageLocationId` |
| Đích của Detail | endpoint kệ + `destinationStorageLocationId` | endpoint kệ + `destinationStorageLocationId` |

Khi tạo request, backend (`CreateTransportRequest`) kiểm tra mỗi storage location: phải **active**, thuộc đúng warehouse
và **gắn đúng endpoint** của Detail (`LOC-SIM-A` ↔ `EP-RACK-A`). Nếu sai, trả 400. Script gửi đủ cả endpoint lẫn storage
location nên request hợp lệ.

## 3. Đã thay đổi gì

- `samples/simulation/01-seed.sim-containers.sql`:
  - thêm `CTN-RL-000001..3` (id `e7…07`, `e8…08`, `e9…09`), status `STORED`, đặt sẵn trên `LOC-SIM-A` / `LOC-SIM-B`;
  - chạy lại seed thì job và request cũ của các thùng này bị xoá, và thùng được **đặt về kệ ban đầu**, nên demo lặp lại
    được bao nhiêu lần cũng được.
- `samples/simulation/run-job-sim.ps1`:
  - `-Scenario relocation` giờ là kệ → kệ (trước đây là IN1→A, IN1→B, C→OUT1);
  - Detail có endpoint kệ thì tự gửi kèm `sourceStorageLocationId` / `destinationStorageLocationId` (bảng
    `$storageLocations`);
  - file kết quả của kịch bản khác inbound có tiền tố: `responses/relocation.10-job…`, `relocation.11-job.final.json`,
    `relocation.13-job.run.log.txt`; file của inbound giữ tên cũ.
- `samples/workflows/INTERNAL_RELOCATION.request.json`: câu hướng dẫn cho nhân viên rõ hơn (lấy khỏi kệ nguồn, cất lên
  kệ đích). Workflow v1 **đã PUBLISHED** trong DB vẫn dùng câu cũ; câu mới chỉ áp dụng khi tạo phiên bản mới.

Không đổi code backend hay web.

## 4. Cách chạy demo

```powershell
cd infrastructure; docker compose up -d; cd ..
powershell -ExecutionPolicy Bypass -File samples/simulation/run-backend-sim.ps1          # terminal 1
powershell -ExecutionPolicy Bypass -File samples/simulation/seed-sim.ps1                # một lần
wsl -d Ubuntu-24.04 -- bash /mnt/d/WaroTransSim/scripts/run-sim.sh                      # terminal 2 (Gazebo)

# Tự chạy hết, script đóng vai nhân viên xác nhận:
powershell -ExecutionPolicy Bypass -File samples/simulation/run-job-sim.ps1 -Scenario relocation

# Demo với thầy trên web: chỉ tạo + queue, rồi bấm Start và Confirm trên trang Live job
powershell -ExecutionPolicy Bypass -File samples/simulation/run-job-sim.ps1 -Scenario relocation -PrepareOnly
```

Log rút gọn của lần chạy 2026-10-16 (`responses/relocation.13-job.run.log.txt`):

```
[  18s]  5/17 | PICKUP_CONFIRM  WAITING A CTN-RL-000001  | robot (3.18,3.59) SUCCEEDED
[  40s]  9/17 | PICKUP_CONFIRM  WAITING B CTN-RL-000003  | robot (4.81,3.60) SUCCEEDED
[  60s] 12/17 | DROPOFF_CONFIRM WAITING C CTN-RL-000001  | robot (6.53,3.62) SUCCEEDED
[  88s] 16/17 | DROPOFF_CONFIRM WAITING A CTN-RL-000003  | robot (3.19,3.87) SUCCEEDED
[  91s] COMPLETED 17/17
```

## 5. Giới hạn hiện tại

- **Vị trí container chưa được cập nhật** sau `DROPOFF_CONFIRM`: chạy xong, `CTN-RL-000001` vẫn ghi `LOC-SIM-A` trong
  `warehouse.containers`. Inbound cũng vậy, `CTN-IN-*` vẫn là `PACKED` và không có kệ. Muốn tồn kho đúng thì cần một
  handler: khi JobContainer `DELIVERED`, đặt `current_storage_location_id` = kệ đích và status `STORED`. Việc này để
  làm sau.
- Container ID và storage location ID là cố định trong seed và script; chúng khớp với `seed-sim.ps1` bước 2b
  (`f0000000-…-000000000001..3` = A/B/C).

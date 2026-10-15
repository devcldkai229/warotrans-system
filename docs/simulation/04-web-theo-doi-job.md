# GĐ 4 — Web theo dõi Job trực tiếp (Gazebo + web như video)

> Trạng thái: **XONG phần code**, nhánh `feature/simulation-robot-workflow`. Trang: **`/monitor/live`** (menu *Monitor → Live job*).
> Đã kiểm tra: typecheck + lint web, backend build, SignalR negotiate (WebSockets) với token thật, robot ảo có GUI Gazebo
> online, Job `CREATED` sẵn sàng. Phần **nhìn bằng mắt** (bấm Start / Confirm trên trình duyệt) do bạn thực hiện.

## 1. Màn hình

```
┌──────────── Live job ────────────┐┌────────────────────── Map (map thật của WH-SIM) ─────────────────────┐
│ [JOB-… · RUNNING · 8/19 ▼]  ●Realtime ││  RBT-SIM-01 (1.80, 6.20) · NAVIGATING                             │
│ JOB-20261015-000002   [RUNNING] ││   ▪Kệ A ◇        ← robot ▲ ─ ─ ─► (đường tới endpoint đích)          │
│ REQ-… · request In progress     ││   ▪Kệ B ◇                                     ◇ Kệ D▪               │
│ ███████░░░░░ 8/19 · 42%         ││   ▪Kệ C ◇                                     ◇ Kệ E▪               │
│ CTN-SIM-000001 · ONBOARD …      ││              [MOVE_PICKUP · EXECUTING]        ◇ Kệ F▪               │
│ #1 Job checks          Completed││                                                                      │
│ #2 Pickup stop · Ke A  Running  ││  (ảnh occupancy map + endpoint, robot di chuyển theo telemetry)      │
│   ● MOVE_PICKUP …   Executing   ││                                                                      │
│ #3 Pickup CTN-SIM-000001 · Ke A ││                                                                      │
│   ● PICKUP_CONFIRM  Waiting     ││                                                                      │
│     Waiting for Staff [Confirm] ││                                                                      │
└──────────────────────────────────┘└──────────────────────────────────────────────────────────────────────┘
```

- **Trái**: chọn Job, trạng thái, % tiến độ (`completedSteps/totalSteps`), container (`ASSIGNED → ONBOARD → DELIVERED`),
  từng JobTask (*Job checks*, *Pickup stop · Ke A*, *Pickup CTN-… · Ke A*, …) với từng step. Step đang chạy được viền đậm.
  - Job `CREATED`: nút **Start** (chọn robot hoặc để backend tự chọn).
  - Step `PICKUP_CONFIRM` / `DROPOFF_CONFIRM` đang `WAITING`: nút **Confirm** (gửi đúng container của step, backend vẫn kiểm).
  - Step lỗi hiện `errorCode: errorMessage`. CHECK hiện lý do (vd. `battery_ok`).
- **Phải**: map thật của Job (`useMonitorMapVersion` → ảnh occupancy + endpoint). Robot vẽ theo pose **telemetry**.
  Có vạch đường từ robot tới endpoint đích của bước MOVE, nhãn bước hiện tại cạnh robot, và các endpoint của Job được làm nổi.

## 2. Dữ liệu chảy thế nào

```
Gazebo → gateway → MQTT telemetry ─► Fleet ProcessRobotTelemetry ─► SignalR "robotTelemetryUpdated" ─┐
                                                                                                       ├─► /hubs/notifications ─► web
Job engine (step/job đổi trạng thái) ─► JobStepStatusChanged / JobStatusChanged                        │      useNotificationsHub
                                     ─► Host SignalRJobRealtimeForwarder ─► "jobUpdated" ───────────────┘      ├─ pose robot → map (ngay)
                                                                                                              └─ jobUpdated → refetch GET /jobs/{id}
Web ── REST ──► POST /jobs/{id}/start · POST /job-steps/{id}/confirm · GET /jobs, /jobs/{id}, /fleet/robots/{id}, /transport-requests/{id}
```

- SignalR là kênh chính (rules/09: realtime qua SignalR, REST cho lệnh/truy vấn). Header báo **● Realtime**.
- Mất SignalR thì trang tự **poll** (Job 1.5 s, robot 1 s) và header báo **Polling**.
- Web không tự suy ra trạng thái hay luật nào. Mọi thứ hiển thị đều lấy từ backend (`currentStepId`, status, resolvedInputs).

## 3. Thay đổi

| Nơi | File |
|---|---|
| Backend (Host) | `Realtime/SignalRJobRealtimeForwarder.cs`: `JobStatusChanged` / `JobStepStatusChanged` → SignalR `jobUpdated`; đăng ký trong `Program.cs` |
| Web API | `shared/api/jobs.ts` (list/get/start/confirm + kiểu DTO), `shared/api/client.ts` (`getAccessToken`, `getApiUrl`) |
| Web realtime | `shared/realtime/useNotificationsHub.ts`: 1 kết nối SignalR dùng chung, token qua `access_token`, tự reconnect |
| Web trang | `features/jobs/JobLivePage.tsx`, route `/monitor/live[/:jobId]`, menu *Live job* |
| Thư viện | `@microsoft/signalr@8.0.7` (npm, `package-lock.json`) |
| Demo | `run-job-sim.ps1 -PrepareOnly`: chỉ tạo request + Job `CREATED` và in link web |

Trang mock cũ `/monitor/jobs/:jobNo` (`JobDetailPage`) **giữ nguyên**, không đụng.

## 4. Cách xem (Gazebo + web cạnh nhau như video)

```powershell
cd infrastructure; docker compose up -d; cd ..
powershell -ExecutionPolicy Bypass -File samples\simulation\run-backend-sim.ps1                     # terminal 1
wsl -d Ubuntu-24.04 -- bash /mnt/d/WaroTransSim/scripts/run-sim.sh  # terminal 2 → cửa sổ Gazebo
cd web; npm run dev                                                                                  # terminal 3 → http://localhost:5173
powershell -ExecutionPolicy Bypass -File samples\simulation\run-job-sim.ps1 -PrepareOnly             # in ra link /monitor/live/{jobId}
```

Đăng nhập web bằng **`admin` / `Admin@123`** (web admin chỉ cho role ADMIN; các API Start / Confirm nhận cả Staff lẫn Admin), mở link rồi bấm **Start**. Đặt cửa sổ Gazebo cạnh trình
duyệt: robot chạy trong Gazebo và icon trên map web di chuyển theo. Khi bước chuyển *Waiting for Staff* thì bấm **Confirm**.

## 5. Giới hạn

- Chưa có test UI tự động cho trang mới (đã có typecheck + lint). Kiểm thử bằng mắt theo mục 4.
- SignalR gửi cho mọi client (`Clients.All`), chưa chia nhóm theo kho / Job.
- Map vẽ robot đang chạy Job, chưa vẽ các robot khác.
- Nút Confirm gửi container mà backend chờ (giả lập quét đúng). Ca quét sai container được test ở backend (400 `handover_container_mismatch`).

## 5. Bấm thử một Transport request từ đầu đến cuối trên web (chạy trên Gazebo)

Chuẩn bị (một lần): backend (`run-backend-sim.ps1`), web (`npm run dev`), robot ảo (`run-sim.sh`), `seed-sim.ps1`.
Seed tạo sẵn map, 9 endpoint, 5 zone và 3 storage location `LOC-SIM-A/B/C` (Rack A/B/C). Form tạo request
chỉ chọn được kệ qua storage location. Chạy `run-job-sim.ps1 -PrepareOnly` một lần để seed container và workflow.

1. Đăng nhập `admin / Admin@123`, vào **Monitor → Transport requests**, bấm **New request**.
2. Chọn kho **WH-SIM**, map đang publish, workflow **Inbound put-away**.
3. Thêm container `CTN-IN-000001..3`:
   - **From** → tab *Endpoint* → *Inbound 1* hoặc *Inbound 2*;
   - **To** → tab *Location* → *LOC-SIM-A/B/C*, chọn tầng.
4. Submit. Request hiện ở nhóm *Submitted*. Bấm vào request để mở panel chi tiết.
5. Bấm **Run on robot**: web gọi `queue` (lập kế hoạch Job), rồi `start` (backend chọn robot rảnh trên map,
   ở đây là RBT-SIM-01), rồi chuyển sang **Live job**.
6. Trên Live job: robot trên web chạy cùng lúc với cửa sổ Gazebo. Mỗi khi robot dừng ở cửa nhập hoặc kệ, bấm **Confirm**.
7. Hết step thì Job `COMPLETED`, request `COMPLETED`.

Panel chi tiết của request có job thì hiện nút **Start JOB-… on robot** (job `CREATED`) hoặc **Watch JOB-… live**.
Panel tự làm mới mỗi 3 s.

Đã kiểm tra bằng chính chuỗi API trên (body như form gửi lên, start không chỉ định robot):
JOB-20261015-000012 `COMPLETED` 15/15, REQ-20261015-000013 `COMPLETED`, đích `LOC-SIM-A`, `LOC-SIM-C`.
### 5.1 Confirm và chạy lại để demo

- Khi robot dừng chờ nhân viên, đầu panel trái của **Live job** hiện thẻ cam **Action required**:
  tên step, container cần quét, vị trí, kèm nút **Confirm** lớn. Danh sách step tự cuộn theo step đang chạy.
- Job xong (`COMPLETED` hoặc `FAILED`) thì Live job hiện nút **Run again on robot**. Panel chi tiết của request đã xong
  (trang Transport requests) cũng có nút này. Nút tạo một request mới y hệt (cùng workflow, map, container, điểm đi/đến,
  ghi chú "Replay of REQ-…"), queue, start, rồi mở Live job của job mới. Demo bao nhiêu lần cũng được, chỉ cần Gazebo đang chạy.
- Nếu map của request cũ không còn PUBLISHED (đã đổi map), backend từ chối và nút hiện lỗi. Khi đó hãy tạo request mới.

Đã kiểm tra: REQ-20261015-000014 (replay của REQ-20261015-000013) → JOB-20261015-000013 `COMPLETED` 15/15.
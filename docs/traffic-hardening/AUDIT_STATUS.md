# Trạng thái xử lý audit Traffic — 2026-10-28

Theo dõi tiến độ xử lý audit [2026-10-28-route-traffic-audit.md](../audits/2026-10-28-route-traffic-audit.md).

| | |
|---|---|
| **Commit** | `warotrans-system` → `fd62d55` (branch `feature/traffic-hardening`)<br>`warotrans` → `dfc70a2` (branch `feature/traffic-hardening`) |
| **Unit test** | backend 460/460 PASS · robot 220 PASS, 1 skipped |
| **E2E 1 robot** | **PASS** — JOB-20261028-000003, 17/17 bước, 107 giây |
| **E2E 2 robot** | NOT_RUN (sim chưa hỗ trợ 2 stack Nav2) |
| **Chưa xong** | Phase B (hết lượn hình sin), lặp lại E2E ≥3 lần, 7 file deliverable còn lại |

**Chưa push.** Toàn bộ nằm trên branch `feature/traffic-hardening` ở cả hai repo.

---

## 1. Kết quả lớn nhất: job chạy trọn vẹn lần đầu tiên

```
  1s   MOVE_TO_DOCK      → IN      (robot rời EP-PARK-1)
 14s   RECEIVE_CONFIRM   × 3       (robot tại 0.18, -0.13)
 27s   MOVE_TO_RACK      → S01
 36s   PUTAWAY_CONFIRM   S01
 40s   MOVE_TO_RACK      → S02
 80s   PUTAWAY_CONFIRM   S02
 84s   MOVE_TO_RACK      → S03
102s   PUTAWAY_CONFIRM   S03
107s   COMPLETED 17/17 · REQ-20261028-000003 COMPLETED
```

Kiểm tra sau khi xong:

| Mục | Kết quả |
|---|---|
| Authority còn treo | Không |
| RENEW còn chạy sau khi xong | Không |
| Robot bị quarantine | Không |
| `controller patience exceeded` | 0 lần |
| FAULT | 0 lần |
| SAFE_STOP_REACHED / EXTEND_AUTHORITY | 17 / 13 (đúng nhịp segment) |

So với trước: 27/10 job dừng ở 4/17 rồi 11/17; nay 17/17.

---

## 2. Phase A — Correctness: **DONE**

Mỗi lỗi đều có regression test, đã kiểm là **đỏ trên code cũ** trước khi sửa.

### Backend (`fd62d55`, `b26cd86`)

| ID | Nội dung | Test |
|---|---|---|
| T1 | MOVE không còn xoá occupancy/quarantine. `EnsureTracked` seed robot chưa biết theo pose | 3 |
| T2 | `authority_state` chỉ rebuild từ pose mới và đã định vị; robot đang chạy giữ nguyên authority | 3 |
| T3 | EXTEND kiểm chu trình chờ → `DEADLOCK_RISK` thay vì kẹt vĩnh viễn | 1 |
| T4 | Mutex `node:<id>` cho giao cắt / safe-stop / station | 2 |
| T5 | Resource bay phủ cả hai chiều connector | 1 |
| T6 | Safe-stop đích được giữ chỗ (qua `node:` mutex) | — |
| T7 | Waiter `EXIT_BLOCKED` xếp hàng cả trên resource của bên chặn | 1 |
| T8 | Restart seed mọi robot online theo pose + authority tích luỹ; robot đang chạy → quarantine | 1 |
| T9/T10 | EXTEND chỉ sau báo cáo hợp lệ tại safe-stop đích; không trả resource phía trước | 4 |
| T11 | `IsPhysicallyClear` cộng margin định vị; service hold không bị trả | 1 |
| T12 | `CompleteRoute` bỏ qua result của authority cũ | 1 |
| T13 | Quarantine phát `REVOKE_AUTHORITY`; mất định vị thì giữ authority để tự phục hồi | 2 |
| T14 | Outbox 2 kênh: Grant/Extend/Revoke không bao giờ bị drop | 1 |
| T16 | Đổi graph khi đang có holder → `GRAPH_IN_USE`; resource id lạ bị từ chối | 1 |
| T17 | Lane hai chiều luôn loại trừ xe ngược chiều, kể cả capacity ≥ 2 | 1 |
| G4 | graphHash gồm phiên bản compiler, options, occupancy, station meta | 1 |
| G6 | Endpoint cạnh lane được phục vụ **trên** lane, không bẻ lane | 1 |
| G7 | `OccupancyGrid` lật hàng đúng chuẩn map_server | 1 |
| G8/G9 | NO_STOP phủ JUNCTION không sinh chord; chord luôn mang zone của nó | 2 |
| G10 | Endpoint gần junction hơn lane thì đi qua junction | 1 |

Hai assert yếu đã siết: `Cyclic_wait_grant_rejected` (trước assert `length >= 0`, luôn đúng) và `Two_robots_at_one_junction` (trước chấp nhận mọi lý do khác null).

### Robot (`dfc70a2`, `c434498`)

| ID | Nội dung |
|---|---|
| G1 | graphHash đọc từ `properties.graphHash` trong file export; Active mode từ chối grant nếu chưa có hash |
| G2 | Từ chối edge id lạ và chuỗi edge đứt đoạn; executor không nối tắt đường thẳng qua chỗ thiếu |
| G3 | Bỏ fallback băm bytes (không bao giờ khớp hash canonical của backend) |

---

## 3. Phase C — Hình học map: **DONE (một phần)**

**MAP-WHSIM-V019 đã publish** (`d676f366-6f08-417d-921f-ac89e0b18626`), V018 chuyển ARCHIVED.

| Endpoint | V018 | V019 | Lý do |
|---|---|---|---|
| EP-INBOUND | (−0.045, −0.133) | (0.045, −0.133) | clearance 0.198 → 0.280 m (cần ≥ 0.226) |
| EP-OUTBOUND | (−0.058, −1.782) | (0.032, −1.782) | 0.186 → 0.276 m |
| EP-INSPECTION | (1.22, 0.344) | (1.22, 0.254) | 0.187 → 0.277 m |
| EP-SORAGE_SELF_1 | (0.492, −0.849) | (0.442, −0.849) | lệch 5 cm khỏi tâm lane |
| EP-SORAGE_SELF_2 | (1.612, −0.883) | (1.600, −0.883) | lệch 1.2 cm |
| EP-SORAGE_SELF_4 | (3.461, −1.944) | (3.461, −1.935) | lệch 0.9 cm |
| EP-SORAGE_SELF_5 | (0.965, −1.939) | (0.965, −1.929) | lệch 1.0 cm |

Kết quả: **số điểm gấp khúc trên lane giảm 12 → 1**, `TURN_CLEARANCE` 3 lỗi → 0.

StorageLocation tự rebind sang endpoint V019. Robot chuyển map bằng [sim-v019-robots.sql](../../samples/simulation/sim-v019-robots.sql) (Fleet chưa có API đổi map của robot).

**Còn lỗi mức Error trên V019** (chưa chặn chạy, nhưng chưa sạch): 13 `OVERLAP_ASYMMETRIC`, 4 `CORRIDOR_NO_STOPLINE`, 3 `CRITICAL_NO_EXIT`. Chưa điều tra.

---

## 4. Phase B — Hết lượn hình sin: **CHƯA LÀM**

Đo trên hành lang thẳng của lần chạy thành công:

```
lệch tâm RMS = 5.1 cm   đỉnh = 14.6 cm   (53 mẫu, đoạn x 2.4 → 0.3)
```

Vẫn lượn. Các mục P1 (lookahead 0.20 m so với v = 0.35 m/s), P2 (gia tốc góc smoother), P4 (AMCL), P5 (wheel_separation), P7 (clock của gate), P8 (preempt khi EXTEND), P9–P11 **chưa đụng tới**. Mục tiêu đặt ra là RMS < 1 cm.

Lưu ý khi làm: thứ tự merge tham số Nav2 là `nav2_params` → `outdoor` → `sim` → `route`, nên overlay sim **không** ghi đè được lookahead của `route`. Phải đổi thứ tự hoặc thêm overlay riêng.

---

## 5. Phát hiện mới trong lúc chạy thật (không có trong audit)

| # | Vấn đề | Trạng thái |
|---|---|---|
| N1 | Bản vá tạm costmap 2.5 cm cho V018 làm số ô gấp 4, khiến `collision_monitor` đói CPU trên WSL; lifecycle_manager tắt cả Nav2 giữa lúc đang chạy (robot đứng im 552 s). | **Đã sửa** — V019 sửa clearance thật nên đã gỡ vá, quay lại lưới 5 cm |
| N2 | `LocalMapAssetStore` tìm PGM theo id của map, nên bản clone không đọc được ảnh của map nguồn → compile không có occupancy → sai safe-stop. | **Đã sửa** + 2 test (gồm test chặn URI thoát thư mục gốc) |
| N3 | Thay đổi T2 của mình quá tay: robot vừa khởi động gửi `authority_state` trước khi có telemetry → bị quarantine vĩnh viễn, mọi MOVE sau đó fail ngay 1 s. | **Đã sửa** — chỉ quarantine khi robot thực sự đang giữ chỗ; + 2 test |
| N4 | Sau khi job xong, robot vẫn giữ `bay:EP-INBOUND` dù đã sang S03. Station hold không được trả khi rời trạm. | **CHƯA SỬA** — rò rỉ tài nguyên, sẽ chặn robot thứ hai vào INBOUND |
| N5 | `run-job-sim.ps1` hard-code tên container Postgres. | **Đã sửa** — override bằng `WAROTRANS_PG_CONTAINER` |
| N6 | `ros2_ws/scripts/_agent_pi_*ssh.py` chứa user + mật khẩu SSH của Pi dạng plaintext. Mình lỡ đưa vào commit rồi gỡ ra ngay (chưa push), và đã thêm vào `.gitignore`. | **Cần bạn xử lý: đổi mật khẩu Pi** |

---

## 6. Việc bạn cần biết / cần làm

1. **Đổi mật khẩu SSH của Pi** (N6). File vẫn nằm trong working tree, giờ đã bị gitignore.
2. **Postgres**: cổng 5433 đang bị project khác (`glitch-postgres`) chiếm, nên mình chạy container tạm `warotrans-postgres-5434` trỏ vào đúng volume `infrastructure_postgres_data`. Backend và script sim đang dùng cổng 5434.
3. **AWS key** vẫn cần rotate (đã gỡ khỏi `appsettings.json` từ 27/10). Backend đang chạy với `MapAssetStorage__Provider=Local`.
4. V018 đã ARCHIVED; mọi thứ (sim config, layout, graph robot, seed) đã chuyển sang V019.

---

## 7. Việc còn lại

| Ưu tiên | Việc |
|---|---|
| P0 | Phase B: tuning RPP + smoother, đo lại RMS cross-track |
| P0 | N4: trả station hold khi rời trạm |
| P1 | Chạy E2E ≥ 3 lần sạch liên tiếp (hiện mới 1 lần) |
| P1 | Dọn 20 lỗi Error còn lại của V019 (overlap, stopline, critical-no-exit) |
| P1 | 7 deliverable còn lại (`TRAFFIC_ROOT_CAUSE_AND_FIXES.md`, `NAVIGATION_TRACKING_REPORT.md`, …) |
| P2 | Hạ tầng 2 robot có namespace → Phase E (12 kịch bản) |

---

## Phụ lục: cách chạy lại

```powershell
# backend (Postgres 5434, map asset local)
& "<scratchpad>\start_host.ps1"

# E2E
$env:WAROTRANS_PG_CONTAINER = "warotrans-postgres-5434"
& samples\simulation\run-job-sim.ps1
```

```bash
# sim (WSL), GUI=false để chạy headless
GUI=false bash ros2_ws/scripts/launch_sim_active.sh > /tmp/waro-sim-logs/run.log 2>&1
```

Bằng chứng lần chạy thành công: `/tmp/waro-sim-logs/{run,mqtt,pose}.log` trong WSL (mất khi WSL khởi động lại).

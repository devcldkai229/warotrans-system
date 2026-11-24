# Technical E2E trên RBT-002 (bench) — trạng thái 2026-11-24 → 25

Mục tiêu: mỗi transport request (TR) chạy trên robot thật, bơm một lỗi bằng Fault Injection Lab, AI tự điều tra
bằng evidence (event, quỹ đạo, plan, video trên AWS). Tôi tự chấm kết quả AI; lỗi do code thì tạo phiếu và đẩy Jira.

**Tiến độ: đã chạy 6/12 case của ma trận và 1 case lỗi tự nhiên (N1). Còn case 5 (chạy lại), 6 (chạy lại sau khi sửa
detector), và case 7–12.** Robot đã được tắt để sạc pin.

## 1. Kết quả từng case

Tiêu chí chấm (6 điểm): đúng loại lỗi · đúng robot · đúng khoảng thời gian · dẫn đúng evidence · phân loại
CODE/ENV/OPS hợp lý · đề xuất xử lý an toàn.

| # | TR | Lỗi bơm | Kết quả chuyến | AI case | Detector | Chấm | Phiếu / Jira |
|---|---|---|---|---|---|---|---|
| 1 | R241126004 INBOUND → A-1 | không (CTRL) | COMPLETED | không mở case (đúng) | — | ĐẠT | — |
| N1 | R241126005 INBOUND → A-2 | không, **lỗi code thật** | PAUSED, RESULT_TIMEOUT | case-cd66f0eb9a (chạy tay) | không có (khi đó chưa có evidence cổng) | 3/6 | chưa (AI gán TECHNICIAN) |
| 2 | R241126006 INBOUND → A-2 | IOT-01 mất MQTT 75 s | RECOVERY_REQUIRED, OFFLINE_ABORT | case-9075e79356 | ROBOT_OFFLINE_DURING_TRIP, ROBOT_QUARANTINED | **6/6** | IssueReport e56dfac2 |
| 3 | R241126007 INBOUND → B-2 | NAV-01 Nav2 abort lặp | COMPLETED (gateway tự thử lại) | case-b9a9d41684 | NAV_ABORT_LOOP | 5/6 | IssueReport 319b786f |
| 4 | R241126008 INBOUND → C-1, kèm inspection | OPS-03 không ai xác nhận 200 s | COMPLETED | case-8473884253 | HUMAN_STEP_WAITING_TOO_LONG | **6/6** | IssueReport bd7ac5b2 |
| 5 | R241126011 OUTBOUND A-1 | IOT-02 lidar | COMPLETED | **không có** | — | KHÔNG ĐẠT (do cách bơm lỗi) | — |
| 6 | R241126012 OUTBOUND A-2 | NAV-02 giữ MOVE ~6 phút | PAUSED, NAVIGATION_FAILED | **không có** | — | KHÔNG ĐẠT (do detector) | — |

Chi phí AI: khoảng 0.02–0.03 USD mỗi lần điều tra, 5 lần, tổng khoảng 0.12 USD.

Nhận xét khi chấm:
- **Case 2:** AI nêu đúng khoảng 16:08:11–16:09:21, khớp lúc bơm lỗi (16:08:06, kéo dài 75 s). Kết luận lỗi mạng,
  chuyển technician, và yêu cầu đưa robot vào chế độ bảo trì trước khi kiểm tra.
- **Case 3:** AI thấy "4 lần abort trong 14 s". Nhưng AI kết luận "planner/controller không ổn định", trong khi thật ra
  goal được gửi tới một điểm ngoài map. Evidence không có toạ độ goal, nên AI không thể biết (lỗ hổng 4.3).
- **Case 4:** AI nói chính xác "Confirm Goods Pickup chờ 201 s", lỗi vận hành (OPERATIONS_STAFF), robot bình thường.
- **N1:** AI thấy Nav2 abort và traffic thu hồi rồi cấp lại grant, nhưng không chỉ ra nguyên nhân gốc (xem 2.1). AI tự
  nói còn thiếu log, tức không bịa.

## 2. Lỗi code thật mà đợt test tìm ra

1. **Traffic bị kẹt bởi grant một phần (bug A1/A2 trong audit).** Trên develop, profile RealRobot dùng prefix grant,
   horizon 0.6 m. Robot đi hết phần được cấp thì gateway đóng cổng (`OUTSIDE_RESERVATION`). Host vẫn coi robot là
   Authorized, không ai xin hay cấp thêm, nên robot đứng tới RESULT_TIMEOUT (case N1).
   - Cách vòng qua trên bàn thử: chạy Host với `Traffic__SemanticPrefixGrant=false` và
     `Traffic__SemanticHorizonMeters=20` qua `tools/technical_e2e/run_host.py`. launchSettings không bị sửa.
   - Cách sửa thật: nhánh zone-chain (cấp trọn chuỗi zone).
   - **Nên tạo Jira cho bug này.** AI chưa đề xuất vì lần chạy N1 thiếu evidence cổng.
2. **Evidence agent không bao giờ upload video của chuyến mới.** Trong spool còn khoảng 70 recording cũ từ 20–23/11.
   Upload-grant của chúng trả 404/429 mãi, mỗi cái thử lại khoảng 2.475 lần với backoff cố định 5 s, và chiếm hết lượt
   upload. **Đã sửa:** segment Recorder không biết thì cất đi 30 ngày, backoff tăng dần, recording mới upload trước.
   Sau khi sửa: 172 segment VERIFIED trên S3.
3. **Detector của AI không bao giờ bắt được lỗi trên journal thật.** SENSOR_STALE, CLOCK_JUMP,
   MAP_FINGERPRINT_MISMATCH, HOST_RESTART_MID_JOB, WRONG_CONTAINER_SCAN, STALE_COMMAND_RESULT, NAV_ABORT_LOOP,
   MOVE_STUCK và GATE_BLOCK_WITH_GRANT đều thiếu dữ liệu. **Đã bổ sung** evidence và mapping cho từng loại (mục 3).
4. **Workflow v2 vẫn trỏ endpoint của V019 (đã archive)**, nên không tạo được TR trên V021. Đã publish workflow v3
   trỏ sang V021 bằng `tools/technical_e2e/workflows_to_map.py`.

## 3. Đã xây / sửa (nhánh `feature/technical-e2e`, đã commit, CHƯA push)

| Repo | Nội dung |
|---|---|
| warotrans-system (worktree `E:/wt-tech-e2e`) | `/api/lab` + trang `/tech/lab` · event lab / host.started / staff.scan-rejected / STALE_RESULT · decision từ chối fingerprint · Jira export qua Operations (`POST /api/operations/issues/{id}/jira`) · nút Investigate with AI · `tools/technical_e2e/*` |
| Warotrans.AI (git riêng, không bao giờ push) | mapper cho các event mới, video theo run, cổng; detector chạy được trên dữ liệu thật; worker chỉ điều tra khi journal đã lắng; action EXPORT_TO_JIRA (chỉ lỗi code); phiếu ghi đủ robot |
| warotrans | lab_faults / lab_controller trong gateway (chỉ khi LAB_ENABLED) · evidence agent: sensor.stale, clock.anchor, gate, sửa uploader · bundle `map_one_v021` |
| warotrans-rbt2 | bench mode (bench_localizer, không AMCL/EKF, Nav2 không tránh vật cản theo lidar) · đồng bộ core từ warotrans |

Test: backend unit 1170, Evidence 62, Architecture 16, AI 63, gateway 452, evidence agent 19, web 299. Tất cả xanh.

## 4. Việc còn lại cho phiên sau

1. **Deploy bản sửa IOT-02 lên Pi** (commit e3e7c72 trong warotrans; cần đồng bộ sang rbt2 rồi deploy). Trước đây
   lab gọi `stop_motor` của sllidar nhưng `/scan` vẫn chạy. Giờ tiến trình driver bị tạm dừng bằng SIGSTOP và chạy lại
   bằng SIGCONT. Sau khi deploy, chạy lại **case 5**.
2. **Sửa detector MOVE_STUCK:** lệnh FAILED kết thúc chính bước đó (trong vài giây cuối) không được tính là "đã có giải
   thích". Sau đó chạy lại **case 6**, hoặc Investigate with AI trên journal R241126012.
3. **Bổ sung evidence toạ độ goal Nav2** của mỗi lần abort (cải thiện case 3).
4. Chạy **case 7–12**: OPS-02 quét sai, IOT-03 đồng hồ, MAP-01 fingerprint, TRA-01 phantom, OPS-04 kết quả muộn,
   OPS-01 restart Host. Runner đã sửa: luôn gửi `checkQuality`, tự tạo phiếu xuất cho OUTBOUND, xác nhận được bước
   inspection (PASSED).
5. Tạo Jira cho bug traffic ở mục 2.1, và đẩy Jira cho các case AI kết luận là lỗi code (DEVELOPER).
6. Case 2 robot (TRA-02, REASSIGN) chờ RBT-001. Phần code tách theo robot đã có test.

## 5. Cách bật lại bàn thử

```
# 1. Robot: bật RBT-002 trên kệ. Service tự chạy fleet + BENCH_MODE + LAB_ENABLED (env đã đặt sẵn).
# 2. Host (Lab bật, cấp trọn đường):
python tools/technical_e2e/run_host.py RealRobot Traffic__SemanticPrefixGrant=false Traffic__SemanticHorizonMeters=20
# 3. Recorder / Worker / web: tools/run-backend.ps1 -HostProfile RealRobot -Evidence Aws -NoInfra -Web
#    (rồi dừng Host của script này, chạy Host bằng run_host.py như bước 2)
# 4. AI (trong backend/src/Warotrans.AI):
.venv/Scripts/python -m uvicorn warotrans_ai.interfaces.api.app:create_app --factory --port 8090
.venv/Scripts/python -m warotrans_ai.interfaces.worker.main --interval 20 --lookback-hours 1
# 5. Định vị robot ở PARKING-B, rồi chạy case:
WARO_PI_PW=... python tools/technical_e2e/localize.py
python tools/technical_e2e/run_case.py 5 6 7 --ai-timeout 900
python tools/technical_e2e/show_case.py <case id>        # đọc kết quả AI để chấm
python tools/technical_e2e/ticket.py <case id> [--jira]  # phiếu (+ Jira nếu là lỗi code)
```

Artifact: `artifacts/technical_e2e/20261124/case-NN.json` và các file `*.log` cạnh đó.
DB backup trước đợt test: `infrastructure/snapshots/*_20261124_before_technical_e2e.*`.

**Bảo mật:** Jira token nằm trong user-secrets của WaroTrans.Host. Token đã lộ trong chat nên **cần đổi token**.
Mật khẩu Pi không được lưu ở đâu.

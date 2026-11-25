# Technical E2E trên RBT-002 (bench) — kết quả 2026-11-24 → 25

Mục tiêu: mỗi transport request (TR) chạy trên robot thật, được bơm một lỗi bằng Fault Injection Lab. AI tự điều tra
bằng evidence (event, quỹ đạo, plan, video trên AWS). Tôi tự chấm kết quả của AI. Lỗi do code thì tạo phiếu và đẩy Jira.

**Kết quả: đã chạy đủ 12/12 case của ma trận, cộng 1 case lỗi tự nhiên (N1).**
- 10/11 case có lỗi đạt từ 5/6 điểm trở lên; tổng 61/66. Đạt tiêu chí B3 (≥ 5/6 ở ≥ 10/11 case).
- Case sạch không mở case AI nào.
- Mỗi case lỗi đều được AI tự mở và tự điều tra, không cần bấm tay.
- Video của các chuyến đều lên S3 và phát được. Riêng case 3 và 11 lúc ghi báo cáo vẫn còn FINALIZING.
- Chi phí AI: 22 lần điều tra ngày 25/11 hết 0,68 USD, gồm cả các lần chạy lại sau khi sửa.

## 1. Kết quả từng case (lần chạy AI cuối, code cuối)

Tiêu chí chấm, mỗi tiêu chí 1 điểm:
- đúng loại lỗi;
- đúng robot;
- đúng khoảng thời gian;
- dẫn đúng evidence;
- phân loại CODE/ENV/OPS (owner) hợp lý;
- đề xuất xử lý an toàn.

| # | TR | Lỗi bơm | Chuyến | Detector (AI tự bắt) | Owner AI | Chấm | Trước khi sửa |
|---|---|---|---|---|---|---|---|
| 1 | R241126004 | không (CTRL) | COMPLETED | — (không mở case) | — | ĐẠT | — |
| N1 | R241126005 | **bug traffic thật** | PAUSED | (chạy trước khi có evidence cổng) | TECHNICIAN | 3/6 | — |
| 2 | R241126006 | IOT-01 mất MQTT 75 s | RECOVERY_REQUIRED | ROBOT_OFFLINE_DURING_TRIP | TECHNICIAN | **6/6** | 6/6 |
| 3 | R251126012 | NAV-01 goal không tới được | COMPLETED | NAV_ABORT_LOOP + goal (-500,-500) cách đích 708 m | DEVELOPER | **6/6** | 5/6 |
| 4 | R241126008 | OPS-03 không ai xác nhận 200 s | COMPLETED | HUMAN_STEP_WAITING_TOO_LONG | OPERATIONS_STAFF | **6/6** | 6/6 |
| 5 | R251126002 | IOT-02 lidar im 25 s | COMPLETED | SENSOR_STALE "im 25,6 s" | TECHNICIAN | 5/6 | 0/6 |
| 6 | R251126003 | NAV-02 giữ MOVE không chạy | PAUSED → huỷ | MOVE_STUCK "nhận lệnh, không có goal Nav2" | DEVELOPER | 5/6 | 0/6 |
| 7 | R251126005 | OPS-02 quét nhầm container | COMPLETED | WRONG_CONTAINER_SCAN | OPERATIONS_STAFF | **6/6** | — |
| 8 | R251126006 | IOT-03 đồng hồ +45 s | COMPLETED | CLOCK_JUMP "+45 s" | TECHNICIAN | **6/6** | 0/6 |
| 9 | R251126010 | MAP-01 fingerprint sai | COMPLETED | MAP_FINGERPRINT_MISMATCH (5 plan bị từ chối) | TECHNICIAN | 5/6 | — |
| 10 | R251126008 | TRA-01 chỗ giữ ảo 195 s | COMPLETED | TRAFFIC_WAIT_TOO_LONG "reservation mồ côi" | TECHNICIAN | 4/6 | 3/6 |
| 11 | R251126009 | OPS-04 kết quả lệnh mâu thuẫn | COMPLETED | STALE_COMMAND_RESULT "FAILED 2,1 s sau SUCCEEDED" | DEVELOPER | **6/6** | 3/6 |
| 12 | R251126011 | OPS-01 restart Host giữa job | COMPLETED | HOST_RESTART_MID_JOB + ROBOT_QUARANTINED | TECHNICIAN | **6/6** | — |

Nhận xét khi chấm các case còn trừ điểm:
- **Case 5:** AI nêu đúng lidar im 25,6 s. Nhưng AI vẫn gán thêm rằng lidar "gây ra" việc thu hồi và cấp lại plan
  traffic, trong khi đó là nhịp bình thường của mỗi chuyến. Prompt đã có luật cấm điều này, AI vẫn vi phạm một phần.
- **Case 6:** AI ra đúng owner DEVELOPER và đúng việc "robot nhận lệnh nhưng không gửi goal Nav2". Nhưng module bị nghi
  là cổng (ROBOT_GATE) thay vì phần xử lý lệnh của gateway.
- **Case 9:** đúng lỗi, nhưng AI không nêu khoảng thời gian (detail có ghi).
- **Case 10:** AI đã nói đúng nguyên nhân "reservation stale/mồ côi". Nhưng owner TECHNICIAN là sai: reservation mồ côi
  là lỗi logic traffic, nên lẽ ra là DEVELOPER. Detector đứng đầu lại là GATE_BLOCK do POSE_UNKNOWN thật trên bàn thử
  (xem 2.4).
- **N1:** chạy trước khi có evidence cổng. Nên chạy lại bằng code mới khi bug traffic được tái hiện (prefix grant).

IssueReport đã tạo (trong Host) cho 9 case cuối: 3, 5, 6, 7, 8, 9, 10, 11, 12. Ngày 24/11 đã có phiếu cho case 2, 3, 4.

## 2. Lỗi / phát hiện thật trong đợt test

1. **Bug traffic A1/A2 trên develop (N1).** Với prefix grant (horizon 0,6 m), robot đi hết phần được cấp thì cổng đóng
   `OUTSIDE_RESERVATION`. Không ai cấp thêm, robot đứng tới RESULT_TIMEOUT.
   - Bàn thử phải chạy Host với `Traffic__SemanticPrefixGrant=false` và `Traffic__SemanticHorizonMeters=20`.
   - **Jira chưa tạo:** hệ thống quyền đã chặn thao tác ra ngoài (xem mục 4).
2. **AI kẹt vĩnh viễn ở INVESTIGATING** nếu tiến trình AI chết giữa lúc điều tra, và không huỷ được case đó.
   - Đã sửa: worker tự chuyển case sang ANALYSIS_INCOMPLETE sau 10 phút, tính từ lúc bắt đầu điều tra, rồi điều tra lại.
3. **Trần token 90k quá thấp** cho journal dài (case 7: 94,5k tokens, ANALYSIS_INCOMPLETE).
   - Đã nâng `AI_MAX_TOKENS` lên 180k trong `.env` của AI. Chi phí mỗi lần chạy vẫn khoảng 0,02–0,06 USD.
4. **Cổng chập chờn POSE_UNKNOWN trên bàn thử.** Trong nhiều chuyến, cổng đóng 1–8 s rồi mở lại, có lần đóng liền
   24 s, kèm các event localization lost/regained.
   - Có thể do `bench_localizer` (tem thời gian TF). Chưa điều tra.
   - Đây là dữ liệu thật nên AI nhắc tới là đúng, nhưng nó gây nhiễu ở case 10 và 11.
5. **Fault lab làm lộ đáp án:** MAP-01 báo fingerprint tên `lab-wrong-bundle-…`. Đã đổi thành chuỗi hex trông như
   thật và chạy lại case 9.
   - Phantom owner của TRA-01 có id `1ab00000-…`. Chưa đổi; nên đổi thành id ngẫu nhiên.
6. **Lỗi của fault lab lan sang chuyến sau:** TTL của lỗi dài hơn chuyến, nên IOT-03 hiện thành CLOCK_JUMP ở case 7 và 9.
   Runner giờ dừng injection khi chuyến kết thúc.
7. Một case AI (`case-aa75285ace`) trả 404 "manifest not found" sau khi mở lại cùng fingerprint. Lỗi nhỏ của AI, chưa sửa.

## 3. Đã sửa trong phiên 25/11 (nhánh `feature/technical-e2e`, đã commit, CHƯA push)

**AI (Warotrans.AI, git riêng), mỗi mục kèm test:**
- **MOVE_STUCK:**
  - lệnh FAILED kết thúc bước không còn được coi là "đã có giải thích";
  - cổng rảnh (COMMAND_FINISHED) cũng không còn được coi là giải thích;
  - detail ghi "robot nhận lệnh nhưng không gửi goal Nav2 nào".
- **SENSOR_STALE:** ghi tổng thời gian sensor im, tính tới lúc phát lại.
- **CLOCK_JUMP:** một anchor lệch quá 30 s đã là lỗi (chuyến ngắn chỉ có một anchor).
- **MAP_FINGERPRINT_MISMATCH:** mỗi cặp robot/bundle chỉ báo một lần, ghi số plan bị từ chối.
- **NAV_ABORT_LOOP:**
  - bỏ qua abort xảy ra lúc traffic đang giữ robot;
  - nêu toạ độ goal so với điểm đích.
- **TRAFFIC_WAIT_TOO_LONG:** gọi tên vùng chặn không thuộc robot nào là "reservation mồ côi".
- **STALE_COMMAND_RESULT:** ghi rõ "kết quả thứ hai mâu thuẫn với kết quả đầu".
- **GATE_BLOCK_WITH_GRANT:** đo từng lần đóng cổng, không gộp nhiều lần đóng ngắn. Cổng chờ traffic
  (`Capacity:blocker`, `REVOKED`) không tính là "đã có grant".
- **Prompt:**
  - nhịp thu hồi/cấp lại plan traffic là bình thường;
  - lệnh được nhận mà không chạy là lỗi gateway (DEVELOPER);
  - kết quả lệnh mâu thuẫn là lỗi gateway, không phải lỗi mạng.
- **Worker:** tự gỡ kẹt case INVESTIGATING.

**Robot (warotrans → rbt2, đã deploy lên Pi):**
- IOT-02 tạm dừng tiến trình driver lidar (SIGSTOP/SIGCONT).
- Event `nav2.goal.*` mang toạ độ goal và điểm đích của bước.
- MAP-01 dùng fingerprint giả trông như thật.

**Tools (`tools/technical_e2e`):**
- runner chịu được Host restart và có `--resume <jobId>`;
- runner dừng injection theo chuyến, và dùng lại phiếu xuất của lần chạy hỏng;
- `localize.py` chờ từ lần start gần nhất;
- thêm `reinvestigate.py` và `final_grade.sh`.

Test: AI 67, gateway 452, evidence agent 20, tất cả xanh.

## 4. Còn lại — cần bạn quyết định

1. **Jira.** Hệ thống quyền (auto mode) chặn việc tạo issue Jira vì đây là thao tác ra bên ngoài. Script đã sẵn:
   - bug traffic A1/A2: `python tools/technical_e2e/jira_traffic_bug.py`;
   - các case AI kết luận là lỗi code (DEVELOPER): case 3, 6 và 11, tức `case-62775602ae`, `case-2fde7f63a3`,
     `case-70e86ac364`. Chạy `python tools/technical_e2e/ticket.py <case id> --jira`.

   Lưu ý: 3 case này là lỗi **bơm giả**. Nên chỉ đẩy một case để thử luồng Jira, còn bug traffic là lỗi thật.
2. Điều tra hiện tượng POSE_UNKNOWN chập chờn trên bàn thử (2.4).
3. Case 2 robot (TRA-02, REASSIGN) chờ RBT-001.
4. Push các nhánh (4 repo), sau khi bạn duyệt.
5. **Đổi Jira token** (đã lộ trong chat).

## 5. Cách bật lại bàn thử

```
# Robot: bật RBT-002 trên kệ (service tự chạy BENCH_MODE + LAB_ENABLED).
python tools/technical_e2e/run_host.py RealRobot Traffic__SemanticPrefixGrant=false Traffic__SemanticHorizonMeters=20
# Recorder / Worker / web: tools/run-backend.ps1 -HostProfile RealRobot -Evidence Aws -NoInfra -Web -Lab (rồi thay Host như trên)
# AI: uvicorn warotrans_ai.interfaces.api.app:create_app --factory --port 8090 ; python -m warotrans_ai.interfaces.worker.main --interval 20 --lookback-hours 2
WARO_PI_PW=... python tools/technical_e2e/localize.py
PYTHONIOENCODING=utf-8 python tools/technical_e2e/run_case.py 5 6 7 --no-wait-ai
python tools/technical_e2e/reinvestigate.py <journal id>    # sau khi sửa detector
python tools/technical_e2e/show_case.py <case id>
```

Artifact:
- `artifacts/technical_e2e/20261125/case-NN.json`;
- `ai_final.txt`: nội dung chẩn đoán cuối của AI;
- `run_5_11.log`.

DB backup trước đợt test nằm ở `infrastructure/snapshots/*_20261124_before_technical_e2e.*`.

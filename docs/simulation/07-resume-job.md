# Resume job: chạy tiếp một job bị dừng giữa chừng (robot offline, Nav2 fail…)

> Nhánh `feature/simulation-internal-relocation` · 2026-10-21.
> Kiểm chứng trên Gazebo (map v6): `JOB-20261021-000001` đang ở `REASSIGNING / robot_offline` tại bước `MOVE_TO_RACK`
> (thùng #3), trong khi robot khởi động lại ở EP-PARK-01. Gọi Resume thì robot tự đi PARK-01 → X-01 → EP-S04,
> Nav2 báo `SUCCEEDED`, job RUNNING ở 15/17 bước và chờ nhân viên xác nhận trả thùng.

## 1. Vấn đề trước đây

Khi một bước fail (robot offline, Nav2 abort, check fail…), engine đưa job vào trạng thái theo `onFailure` của bước:
`PAUSE_FOR_OPERATOR` → **PAUSED**, `REQUEST_REASSIGN` → **REASSIGNING**, mặc định → **FAILED**. Không có API nào đưa
job ra khỏi PAUSED / REASSIGNING. Nút "Run again on robot" tạo **request mới** cùng các thùng, nên bị chặn với lỗi
`container is already part of an active TransportRequest`, vì thùng vẫn thuộc request cũ.

## 2. API mới

```
POST /api/workflow-execution/jobs/{id}/resume      body: { "robotId": null | "<guid>" }   (Staff / Admin)
```

`JobExecutionEngine.ResumeAsync`:

1. Job phải đang **PAUSED** hoặc **REASSIGNING**. Nếu không, trả 409 `job_not_resumable`.
2. Robot là robot cũ của job (mặc định) hoặc robot được chọn. Robot phải cùng map, enabled, online, AVAILABLE và không
   bận job khác. Nếu không, trả `robot_map_mismatch` / `robot_not_available` / `robot_assigned_to_other_job`.
3. **Robot phải biết mình đang ở đâu**: `localizationStatus = LOCALIZED` và telemetry mới hơn 15 s. Nếu không, trả
   409 `robot_not_localized` / `robot_telemetry_stale`. Lý do: robot online lại có thể đang ở chỗ khác (Pi khởi động
   lại, bị đẩy tay). Nav2 lập đường từ một pose sai thì robot có thể đâm vào kệ.
4. Đổi sang robot khác trong khi còn thùng **ONBOARD** trên robot cũ thì trả 409 `payload_recovery_required`. Luồng
   chuyển hàng giữa hai robot chưa làm.
5. Bước FAILED / CANCELLED được mở lại (về PENDING). Các bước đã COMPLETED **giữ nguyên**, robot không chạy lại.
6. **Robot online lại ở chỗ khác**:
   - Job dừng ở bước MOVE: không cần làm gì thêm. Bước MOVE gửi lại lệnh tới endpoint đích, và Nav2 lập đường từ chỗ
     robot đang đứng.
   - Job dừng **sau khi đã tới điểm dừng** (đang chờ nhân viên xác nhận): engine so pose robot với endpoint của điểm
     dừng. Nếu lệch quá `positionTolerance` thì mở lại MOVE của điểm dừng và các bước xác nhận còn dở ở đó. Robot đi
     về điểm dừng rồi mới hỏi nhân viên. Xác nhận đã làm rồi thì không hỏi lại.
7. Job về RUNNING, xoá `failureCode`, rồi `AdvanceAsync` chạy tiếp.

## 3. Kết quả muộn của lệnh cũ

Nếu robot chỉ mất Wi-Fi, nó vẫn chạy nốt goal cũ, và kết quả của lệnh cũ có thể về **sau** khi đã resume. Trước đây
`RobotCommandLifecycleJobStepHandler` khớp kết quả theo `JobStepId`, nên kết quả cũ có thể làm hoàn thành nhầm bước
MOVE mới. Giờ:

- Khi mở lại một bước, mã lệnh cũ được lưu vào `outputValues.supersededRobotCommandIds`.
- Handler chỉ nhận event của **mã lệnh hiện tại** của bước (`JobExecutionEngine.IsCurrentCommand`). Event của lệnh cũ
  bị bỏ qua và ghi log.
- Goal cũ trên robot bị Nav2 thay bằng goal mới (preempt), nên không có hai goal chạy cùng lúc.

## 4. Web

- **Live job**: job ở PAUSED / REASSIGNING có ô chọn robot (mặc định "Same robot (RBT-…)") và nút **Resume**. Lỗi 409
  hiện ngay dưới nút, ví dụ "not localized".
- **Panel transport request**: job kẹt có nút **Resume JOB-… on robot**. "Run again on robot" chỉ hiện khi request
  đã xong **và** không còn job nào đang mở.

## 5. Test

`JobExecutionEngineTests` thêm 8 test (cả bộ unit 311/311 pass):

| Test | Kiểm tra |
|---|---|
| `Resume_after_robot_offline_continues_from_the_failed_move_on_the_same_robot` | REASSIGNING → RUNNING, chỉ gửi lại đúng lệnh MOVE, các CHECK không chạy lại |
| `Late_result_of_the_superseded_command_does_not_complete_the_resumed_move` | Kết quả của lệnh cũ bị bỏ qua, lệnh mới thì được nhận |
| `Resume_drives_back_to_the_stop_when_the_robot_came_back_elsewhere` | Robot cách điểm dừng 4 m → đi lại về A, chỉ hỏi lại C2 (C1 đã xác nhận) |
| `Resume_at_the_stop_asks_staff_again_without_moving` | Robot vẫn ở điểm dừng → không gửi lệnh mới, hỏi xác nhận tiếp |
| `Resume_is_refused_for_a_running_job` | 409 `job_not_resumable` |
| `Resume_needs_a_localized_robot_with_fresh_telemetry` (×2) | 409 `robot_not_localized` / `robot_telemetry_stale`, job vẫn REASSIGNING |
| `Resume_on_another_robot_with_containers_onboard_needs_payload_recovery` | 409 `payload_recovery_required` |

## 6. Chưa làm

- Retry tự động theo `maxAttempts` và timeout theo `timeoutSeconds` của bước.
- Cancel job từ web.
- Payload recovery: chuyển thùng từ robot hỏng sang robot khác.
- Web chưa có nút đặt lại vị trí robot (set initial pose). Hiện phải dùng 2D Pose Estimate trên RViz.

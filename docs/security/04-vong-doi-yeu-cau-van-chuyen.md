# Phase 4: Vòng đời Transport Request, hợp đồng thao tác và realtime

Phạm vi: **WH-04, TRN-01, TRN-02, TRN-03, BOTH-04, RTM-02** (owner: Nguyễn Trung Nguyên).

Tài liệu này mô tả ở mức hệ thống cách một Transport Request (TR) bị **huỷ** hoặc **từ chối**, điều gì xảy ra với Job, Container và tồn kho trong từng trạng thái, cách server quyết định nút nào được hiện ở client, và cách màn hình được cập nhật realtime.

---

## 1. Bức tranh tổng thể

```
TransportRequest (Transportation)  ──1:N──  TransportRequestDetail (1 container / dòng)
        │ queue
        ▼
Job (WorkflowExecution) ──1:N── JobContainer (TransportRequestId + ContainerId)
        │ JobContainerStatusChanged (event)
        ▼
JobContainerStatusChangedHandler  →  cập nhật Detail  →  TR.ApplyDetailProgress()  →  TransportRequestProgressed
```

Transportation **không** đọc bảng của WorkflowExecution. Nó chỉ gọi qua contract mới `ITransportRequestJobControl`:

| Phương thức | Việc làm |
|---|---|
| `GetJobsAsync(trIds)` | Trả danh sách Job (id, số, trạng thái) của từng TR, dùng cho guard Reject và cho DTO. |
| `CancelForRequestAsync(trId, reason)` | Fan-out lệnh huỷ xuống từng Job, trả kết quả theo từng container. |

---

## 2. Huỷ TR (TRN-01, WH-04)

`POST /api/transportation/transport-requests/{id}/cancel  { "reason": "..." }`
- Quyền: `tr.cancel` (chỉ ADMIN). Có audit `transport_request.cancelled`.
- Bắt buộc có lý do (`400 reason_required`).

### 2.1 Kết quả theo trạng thái của container

| Container đang ở | Việc hệ thống làm | Tồn kho |
|---|---|---|
| Chưa lấy (PENDING / ASSIGNED, Job CREATED/QUEUED/RUNNING trước pickup) | Job bị **cancel** như bình thường (traffic vào quarantine nếu đang chiếm chỗ). JobContainer → CANCELLED, Detail → CANCELLED. | **Không đổi**: container vẫn ở vị trí nguồn. |
| **ONBOARD** (đang nằm trên robot) | Job **không bị cancel**. Robot nhận STOP mode PAUSE, MOVE đang chạy được mở lại, Job → **PAUSED** với `failureCode = request_cancelled_cargo_onboard`. Mở **Issue** mức HIGH (idempotent theo `cargo-onboard:{jobId}`). Detail → **CANCEL_PENDING_RECOVERY**. | **Không** coi là đã trả về. Hàng vẫn thuộc Job cho tới khi có người xử lý. |
| DELIVERED / FAILED trước khi huỷ | Giữ nguyên. | Như đã xảy ra. |

### 2.2 Trạng thái TR

- Có ít nhất một container chờ recovery: TR ở trạng thái mới **CANCELLING**, chưa đóng.
- Không còn container nào chờ: TR được aggregate ngay thành trạng thái cuối:
  - mọi Detail CANCELLED → **CANCELLED**;
  - có Detail đã giao → **PARTIALLY_COMPLETED** (đã đóng, có `completedAt`).

Khi TR đang CANCELLING, có hai cách xử lý số hàng trên robot (cả hai đều do người quyết định):

1. **Dỡ hàng tay, rồi Cancel Job.** `POST /jobs/{id}/cancel` **bắt buộc lý do** khi Job còn hàng ONBOARD (`400 cargo_onboard_reason_required`): người huỷ phải ghi hàng đang ở đâu. Container → CANCELLED, Detail → CANCELLED, TR → CANCELLED.
2. **Resume Job để giao nốt.** Resume nhả motion hold của robot (giống pause của operator), Job chạy tiếp. Container → DELIVERED, Detail → COMPLETED, TR → PARTIALLY_COMPLETED.

Detail ở CANCEL_PENDING_RECOVERY **không bao giờ quay lại IN_PROGRESS** chỉ vì một event ASSIGNED/ONBOARD tới muộn. Nó chỉ rời trạng thái này khi Job kết thúc container đó.

### 2.3 Idempotent và thứ tự ghi

1. Handler đặt TR = CANCELLING và lưu **trước**, rồi mới gọi xuống Job. Nhờ vậy các event container đến trong lúc đó đã thấy trạng thái mới.
2. Gọi lại cancel khi TR đã CANCELLED thì trả về TR hiện tại, không làm gì thêm.
3. Gọi lại khi TR đang CANCELLING thì chạy lại fan-out. Fan-out vốn idempotent: Job đã kết thúc trả `ALREADY_FINISHED`, Job đã giữ hàng không bị STOP lần hai, Issue không bị tạo đôi. Như vậy một lần huỷ trước đó bị lỗi giữa chừng sẽ được làm nốt.
4. Event container được xử lý trong scope DI riêng, nên sau fan-out handler xoá change tracker và đọc lại TR rồi mới áp kết quả.

---

## 3. Từ chối TR (TRN-02)

`POST /api/transportation/transport-requests/{id}/reject  { "reason": "..." }`
- Quyền: `tr.reject` (ADMIN). Có audit `transport_request.rejected`.

| Trạng thái TR | Kết quả |
|---|---|
| SUBMITTED | REJECTED. Không có Job nào được tạo. |
| QUEUED, mọi Job còn CREATED/QUEUED | REJECTED. Các Job đã lập kế hoạch bị cancel (chưa có gì chuyển động). |
| QUEUED/IN_PROGRESS, có Job đã chạy | `409 transport_request_already_running`. Lúc này phải dùng Cancel. |
| Trạng thái khác | `409 transport_request_not_rejectable` |

TR lưu thêm `RejectedBy`, `RejectReason`, `RejectedAt`; các Detail chuyển sang CANCELLED. Dữ liệu Container trong kho không bị động tới. Người tạo TR nhận notification `REQUEST_REJECTED` (audience `Person`).

Migration `AddTransportRequestCancelReject` thêm 6 cột: `cancelled_by`, `cancel_reason`, `cancel_requested_at`, `rejected_by`, `reject_reason`, `rejected_at`. Enum được lưu dạng chuỗi, nên `CANCELLING` và `CANCEL_PENDING_RECOVERY` không cần đổi schema.

---

## 4. Quy tắc aggregate mới (sửa lỗi S13)

`TransportRequest.ApplyDetailProgress`:

| Tình huống | Kết quả |
|---|---|
| Mọi Detail terminal, tất cả COMPLETED | COMPLETED |
| Mọi Detail terminal, có ít nhất một COMPLETED | PARTIALLY_COMPLETED **và đóng** (`completedAt`) |
| Mọi Detail terminal, không có COMPLETED, TR đang CANCELLING hoặc tất cả CANCELLED | CANCELLED |
| Mọi Detail terminal, không có COMPLETED, còn lại | FAILED |
| Còn Detail mở, TR đang CANCELLING | Giữ CANCELLING |
| Còn Detail mở, có COMPLETED/FAILED | PARTIALLY_COMPLETED (chưa đóng) |
| Còn Detail mở, có IN_PROGRESS hoặc CANCEL_PENDING_RECOVERY | IN_PROGRESS |

Trước đây hai tổ hợp bị bỏ sót:
- CANCELLED + COMPLETED để TR treo ở PARTIALLY_COMPLETED mà không bao giờ có `completedAt`.
- Cancel một Job có thể để TR kẹt ở IN_PROGRESS.

---

## 5. TRN-03: Pause/Resume cấp TR. Quyết định: **không làm**

**Lý do**
- Một TR có thể có N Job trên N robot. Một API "pause TR" sẽ phải dừng N robot cùng lúc, mỗi robot ở một chỗ khác nhau trong traffic. Resume cũng phải kiểm tra lại eligibility của từng robot. Mọi bước này đã có ở cấp Job (WFX-03: `POST /jobs/{id}/pause` và `/resume`), kèm STOP-verified và giữ traffic.
- Pause ở cấp TR chỉ là vòng lặp gọi pause Job. Ngược lại, nó tạo thêm một trạng thái TR mới cần aggregate (TR "paused" trong khi một Job vẫn chạy, hay một Job lỗi khi resume?). Rủi ro sai custody lớn hơn lợi ích.
- Nhu cầu "dừng hết việc của một yêu cầu" đã được Cancel phục vụ: Cancel có recovery an toàn cho hàng đang trên robot.

**Cách làm thay thế:** trên trang TR, mỗi Job có nút Pause/Resume riêng (lấy từ `availableActions` của Job).

Nếu PO cần pause cấp TR sau này, nên làm ở dạng orchestration mỏng: pause từng Job qua engine, trả về kết quả theo từng Job, và **không** thêm trạng thái TR mới.

---

## 6. availableActions: server quyết định nút (BOTH-04)

DTO chung `ActionAvailability { action, allowed, reason }` (BuildingBlocks).

| Resource | Actions | Nguồn quy tắc |
|---|---|---|
| TransportRequest (GET detail, GET list) | `QUEUE`, `CANCEL`, `REJECT` | `TransportRequestActionPolicy` |
| Job (GET detail) | `START`, `PAUSE`, `RESUME`, `CANCEL` | `JobActionPolicy` |

**Một nguồn duy nhất.** Endpoint và DTO gọi cùng một hàm `StateReason(action, …)`. Engine cũng dùng `JobActionPolicy.StateReason` cho guard Start/Pause/Resume/Cancel, nên mã lỗi `409` trùng với `reason` trong DTO (ví dụ `job_not_running`, `transport_request_already_running`).

**Quyền.** `ICurrentUser.Can(permission)` đọc cùng `RolePermissionMatrix` mà `.RequirePermission()` dùng. Nếu trạng thái cho phép nhưng thiếu quyền, kết quả là `allowed=false, reason="forbidden"`. Ví dụ: STAFF thấy CANCEL bị cấm thay vì không thấy gì, và nếu vẫn gọi API thì nhận `403`.

**Client.** Web (`RequestCloseActions`, `JobOperatorActions`) chỉ hiện nút khi `allowed=true`; mọi kiểm tra trạng thái ở frontend đã bị bỏ (`mapTransportRequest.ts` không còn tự suy `['CANCEL']`). App nhận type `ActionAvailability` trong contracts.

---

## 7. Realtime (RTM-02)

| Event SignalR | Group | Khi nào | Client làm gì |
|---|---|---|---|
| `transportRequestUpdated` | `perm:job.read` | Detail đổi trạng thái (`kind=detail`), TR được aggregate (`request`), bị huỷ (`cancelled`) hoặc từ chối (`rejected`). Gửi **sau commit**. | Refetch `GET /transport-requests/{id}` và danh sách. |
| `trafficUpdated` | `robots:all` + `robot:{id}` | Mọi `TrafficOpsEvent`: Grant, Block, Quarantine, Release, Cancel, Recovery, Timeout gửi ngay; Request/Wait/Enter/Service/Exit tối đa 1 lần/giây cho mỗi robot. | Refetch `/api/fleet/traffic/snapshot`. |

**Nguyên tắc.**
- Event chỉ báo rằng có thay đổi; dữ liệu luôn lấy từ API.
- Event mất hoặc bị throttle thì màn hình chỉ chậm, không bị sai.
- Web refetch toàn bộ danh sách TR mỗi khi hub kết nối lại.
- App đổi tên event từ `transportRequestStatusChanged` (backend chưa bao giờ phát) sang `transportRequestUpdated`. Màn chi tiết và lịch sử TR refetch khi nhận event.

**Hook traffic.** `ITrafficRealtimeNotifier` được gọi trong `TrafficOpsLog.Write`, bọc try/catch. Implementation ở Host (`SignalRTrafficRealtimeNotifier`) gửi fire-and-forget, nên không bao giờ chặn đường xử lý traffic.

**Notification.**
- Người tạo nhận `REQUEST_CANCELLED` / `REQUEST_REJECTED` (trừ khi chính họ là người đóng).
- Floor (ADMIN + STAFF) nhận `REQUEST_CANCEL_RECOVERY` khi còn hàng trên robot. Notification này tự resolve khi TR đóng.

---

## 8. Kiểm thử

| Loại | Nội dung |
|---|---|
| Unit: `TransportRequestProgressTests` | Aggregate mới; huỷ trước pickup; hàng onboard giữ CANCELLING rồi đóng khi dỡ hoặc giao; reject ghi người và lý do. |
| Unit: `ActionPolicyTests` | Ma trận action × trạng thái × role cho TR và Job. |
| Unit: `JobExecutionEngineTests` | Huỷ trước pickup thì Job CANCELLED và không STOP; hàng onboard thì Job PAUSED, đúng một STOP, Issue idempotent, Cancel Job cần lý do. |
| Integration: `TransportRequestLifecycleEndpointTests` | Huỷ idempotent và có lý do; 400 khi không có lý do; STAFF bị 403 và thấy `forbidden`; huỷ TR đã queue thì Job CANCELLED và **Container vẫn STORED tại vị trí nguồn**; reject SUBMITTED/QUEUED; reject sau khi Job chạy trả 409. |

Kết quả:
- Unit: 666 pass.
- Integration Transportation: 20/20 pass.
- Web: typecheck, lint và 25 test pass.
- App: 111 test pass.

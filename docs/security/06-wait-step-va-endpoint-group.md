# Phase 6: WAIT step và EndpointGroup

Phạm vi: **WFX-01, NV-01**. Owner: Nguyễn Trung Nguyên.

---

## 1. WAIT step (WFX-01)

### 1.1 Hành vi

| Mode | Runtime |
|---|---|
| `WAIT.DURATION` | **Có.** Step chuyển sang WAITING và lưu hạn `waitUntil = now + durationSeconds` vào `OutputValues`. |
| `WAIT.EVENT` | **Chưa.** Bị từ chối khi **publish workflow** ("not supported yet"). Nếu vẫn lọt tới runtime thì step FAILED với `step_type_not_supported`. |
| `WAIT.ROBOT_STATE` | Như `EVENT`. |

`EVENT` và `ROBOT_STATE` cần một nguồn event rõ ràng (cửa, thang máy, trạng thái robot cụ thể). Khi có nguồn đó mới mở các mode này, để không có workflow publish được mà ra sàn lại hỏng.

Ràng buộc của `durationSeconds`: từ 0 đến 86 400. Giá trị ngoài khoảng làm step FAILED với `wait_duration_invalid`.

### 1.2 Cơ chế đánh thức bền vững

```
ExecuteStep(WAIT.DURATION) ──► step WAITING, OutputValues.waitUntil, waitStartedAt ──► engine dừng advance (return false)
                                                   │ không giữ thread, lease hay traffic gì thêm
WaitStepWakeupHostedService (mỗi 2 s) ──► JobExecutionEngine.WakeDueWaitStepsAsync()
      • chỉ Job RUNNING có step WAIT đang WAITING
      • đọc lại Job; step phải vẫn WAITING và waitUntil ≤ now
      • step → COMPLETED, outputs: resumeReason=DURATION_ELAPSED, resumedAt, actualWaitSeconds
      • SaveAndPublish ──► AdvanceAsync (chạy step kế tiếp)
```

- **Bền qua restart.** Hạn nằm trong DB. Backend khởi động lại thì lần quét đầu tiên sẽ đánh thức các step đã quá hạn.
- **Đúng một lần.** Step chỉ được hoàn tất khi đang WAITING; lần quét sau thấy COMPLETED nên bỏ qua (có unit test: lần gọi thứ hai trả 0).
- **Cancel khi đang WAIT.** `CancelJobAsync` đặt step thành CANCELLED, nên nó không bao giờ được đánh thức và không có job mồ côi (có test).
- **Pause khi đang WAIT.** Job PAUSED không được quét. Hạn chờ tính theo **đồng hồ thực**: pause không cộng thêm thời gian. Nếu Resume sau khi hạn đã qua, step hoàn tất ở lần quét kế tiếp.

### 1.3 Kiểm thử
| Test | Nội dung |
|---|---|
| `A_wait_step_holds_the_job_until_its_deadline_and_then_advances_once` | Job dừng ở WAIT, robot chưa nhận lệnh. Chưa tới hạn thì không đánh thức. Tới hạn thì đánh thức đúng một lần và robot nhận MOVE kế tiếp. |
| `A_cancelled_job_is_never_woken` | Cancel khi đang WAIT thì step CANCELLED và không được đánh thức. |
| `Only_wait_duration_can_be_published` | Publish chấp nhận DURATION, từ chối EVENT. |

---

## 2. EndpointGroup CRUD (NV-01)

Một EndpointGroup là tập endpoint **cùng một map version** có tên. Ví dụ: "tất cả chỗ đỗ" với chính sách chọn `FIRST_AVAILABLE` hoặc `NEAREST`. Bảng `endpoint_groups` và `endpoint_group_members` đã có sẵn (clone map đã copy group). Phase này bổ sung API.

| Method | Route (`/api/navigation`) | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/maps/{mapVersionId}/endpoint-groups` | `map.read` | Kèm danh sách member (code, name) |
| GET | `/endpoint-groups/{id}` | `map.read` | |
| POST | `/maps/{mapVersionId}/endpoint-groups` `{code, name, selectionPolicy?, endpointIds}` | `map.write` | Chỉ map DRAFT. Code được viết hoa và là duy nhất trong map. Audit `map.endpoint_group_created`. |
| PUT | `/endpoint-groups/{id}` `{name?, selectionPolicy?, isActive?, endpointIds?}` | `map.write` | Chỉ map DRAFT. `endpointIds` thay toàn bộ danh sách member. |
| DELETE | `/endpoint-groups/{id}` | `map.write` | Chỉ map DRAFT. |

**Ràng buộc**

| Mã lỗi | Khi nào |
|---|---|
| `endpoint_group_empty` | Group không có member nào |
| `endpoint_not_in_map` | Có member thuộc map version khác |
| `endpoint_group_code_taken` | Trùng code trong cùng map |
| `map_version_not_draft` | Map đã publish hoặc archive (map đã publish là bất biến) |
| `endpoint_in_use` | Xoá một endpoint đang thuộc group (có sẵn từ trước) |

**Chặn xoá khi workflow tham chiếu.** Hiện workflow chỉ bind endpoint, chưa có workflow nào tham chiếu group, nên chưa có gì để chặn. Khi workflow bắt đầu dùng group (ví dụ bước Parking), `DeleteAsync` là chỗ trả `endpoint_group_in_use`.

**UI.** Web đã có API client (`listEndpointGroups`, `createEndpointGroup`, `updateEndpointGroup`, `deleteEndpointGroup` trong `shared/api/navigation.ts`). Màn hình quản lý sẽ làm khi đã chốt group có dùng cho Parking hay không, đúng như kế hoạch.

**Kiểm thử (integration)**
- `A_group_is_created_listed_changed_and_deleted_on_a_draft_map`: tạo, trùng code, không xoá được endpoint đang là member, cập nhật member, liệt kê, xoá.
- `Members_must_belong_to_the_same_map_and_a_published_map_is_frozen`: member khác map, group rỗng, và sau publish thì không sửa được.

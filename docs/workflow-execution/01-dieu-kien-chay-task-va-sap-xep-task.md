# Điều kiện chạy Task (`RunCondition`) và Sắp xếp lại Task trong Workflow

## 1. Mục tiêu
Cho phép Admin cấu hình điều kiện chạy tùy chọn cho từng `WorkflowTask` (dựa trên biến `BOOLEAN`, điển hình là `STAFF_INPUT` như `checkQuality`) và kéo thả đổi thứ tự các Task trong Workflow Editor, mà không cần nhân bản nhiều phiên bản Workflow cho cùng một nghiệp vụ.

## 2. Kiến trúc & Luồng dữ liệu

```text
Admin cấu hình Workflow (Web Editor)
   ├── Thêm biến BOOLEAN (vd: checkQuality, source = STAFF_INPUT)
   ├── Kéo thả sắp xếp thứ tự Task (reorderItem → cập nhật sequenceNo)
   └── Gắn RunCondition cho Task (vd: checkQuality = true)
            │
            ▼
Staff tạo TransportRequest (RequestSetupPanel)
   └── Chọn Yes / No cho biến checkQuality → lưu vào TransportRequest.WorkflowInputs
            │
            ▼
JobRuntimeProvisioner.ProvisionAsync(...)
   ├── BuildJobContext(...) đưa STAFF_INPUT vào Job.ContextValues
   └── ShouldRunTask(workflowTask, job.ContextValues)
         ├── Khớp điều kiện (true)  → Tạo JobTask (PENDING) + JobStep (PENDING)
         └── Không khớp (false)     → Tạo JobTask (SKIPPED) + JobStep (SKIPPED)
            │
            ▼
JobExecutionEngine.AdvanceAsync(...)
   └── Tự động bỏ qua các Task/Step có trạng thái SKIPPED và chạy sang Task tiếp theo
```

## 3. Các thành phần đã thay đổi

### Backend (`WaroTrans.WorkflowExecution`)
- **Value Object & Entity:**
  - `ValueObjects/TaskRunCondition.cs`: chứa `VariableKey` và `EqualsValue` (JSON property `equals`).
  - `Entities/WorkflowTask.cs` & `Persistence/Configurations/WorkflowTaskConfiguration.cs`: thêm cột `run_condition` (`jsonb`, nullable) trên bảng `execution.workflow_tasks`.
  - Migration: `20261116094442_AddWorkflowTaskRunCondition`.
- **Validation & DTOs:**
  - `Features/Shared/WorkflowDtos.cs` & `Validation/WorkflowDefinitionModel.cs`: truyền `RunCondition` qua `UpsertWorkflowTaskRequest`, `WorkflowTaskDto`, `WorkflowMapping`.
  - `Validation/WorkflowDefinitionValidator.cs`: kiểm tra `RunCondition.VariableKey` phải tồn tại trong `Workflow.Variables` và có `DataType == BOOLEAN`.
- **Provisioning:**
  - `Services/JobRuntimeProvisioner.cs`: hàm `ShouldRunTask` đọc giá trị boolean trong `Job.ContextValues`; nếu không khớp, đánh dấu `JobTaskStatus.SKIPPED` và `JobStepStatus.SKIPPED` ngay khi provision.

### Frontend (`web/`)
- `shared/api/types.ts` & `features/workflows/workflow-defaults.ts`: thêm `TaskRunCondition` vào `WorkflowTaskDraft`.
- `features/workflows/workflow-editor-page.tsx`:
  - Thêm tay cầm kéo thả (`⠿`) ở đầu mỗi Task để sắp xếp lại thứ tự Task (tự đánh số lại `sequenceNo`).
  - Thêm dropdown **Điều kiện chạy (`Run condition`)** trong phần cấu hình của mỗi Task, liệt kê các biến `BOOLEAN` của Workflow (`Always run`, `When <key> = true`, `When <key> = false`).
  - Hiển thị nhãn điều kiện ngay trên header của Task khi thu gọn.
- `shared/i18n/vi/workflows.ts` & `features/workflows/workflows.css`: bổ sung bản dịch tiếng Việt và style kéo thả / badge điều kiện.

## 4. Câu lệnh kiểm chứng
- **Backend Unit Tests:**
  ```bash
  dotnet test backend/tests/WaroTrans.UnitTests/WaroTrans.UnitTests.csproj --filter "FullyQualifiedName~WorkflowExecution"
  ```
- **Frontend Check & Build:**
  ```bash
  cd web && npm run typecheck && npm run lint && npm test && npm run build
  ```

## 5. Phần để lại cho Admin tự cấu hình
- Các Workflow hiện có (`INBOUND`, `OUTBOUND_RETRIEVAL`, `INTERNAL_RELOCATION`) chưa bị chỉnh sửa dữ liệu. Admin tự thêm biến (`checkQuality`, `inspectionEndpointId`), kéo Task Quality Inspection vào giữa, gắn `Run condition = When checkQuality = true`, lưu nháp và `Publish` để sử dụng.

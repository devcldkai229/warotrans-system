# Trang Issues: tab theo loại, lọc mức độ và thời gian báo cáo

Tài liệu giải thích thay đổi ngày 22/11/2026 (nhánh `feature/report-issue`). Trước đây trang **Operations → Issues**
chỉ lọc được theo trạng thái. Giờ trang chia issue theo **loại**, lọc được theo **mức độ** và **khoảng thời gian báo
cáo**.

## 1. Người dùng thấy gì

```
Issues                                                     [📅 Báo cáo: mọi lúc ▾]
 Tất cả 13 │ Container 0 │ Robot 0 │ Công việc 8 │ Vận chuyển 5 │ Lưu trữ 0 │ Khác 0
[Mọi mức độ ▾] [Mọi trạng thái ▾] [Xóa bộ lọc]
 Code  Loại  Mức độ  Mô tả  Báo cáo lúc  Trạng thái
```

- **Tab loại**: mặc định **Tất cả**. Số trên mỗi tab là số issue loại đó **theo các bộ lọc còn lại** (mức độ, trạng
  thái, thời gian), để biết bấm vào tab sẽ thấy bao nhiêu dòng. Trên màn hẹp, thanh tab cuộn ngang.
- **Mức độ**: Thấp / Trung bình / Cao / Nghiêm trọng.
- **Thời gian báo cáo**: dùng lại bộ chọn ngày của Dashboard (Hôm nay, 7 ngày, 30 ngày, Tháng này, Tháng trước, hoặc
  tự chọn từ ngày – đến ngày), thêm lựa chọn **Mọi lúc** và đây là mặc định, để issue cũ chưa xử lý không bị ẩn.
- **Xóa bộ lọc** hiện khi đang lọc mức độ, trạng thái hoặc thời gian.
- Cột Loại và Mức độ hiện bằng chữ đã dịch thay vì mã (`JOB` → Công việc, `HIGH` → Cao).
- Không có dòng nào: "Không có sự cố nào khớp bộ lọc" (khi đang lọc) hoặc "Không có vấn đề" (khi không lọc).
- Trang Technician `/tech/issues` dùng chung component nên có cùng tính năng.

## 2. Bộ lọc nằm trên địa chỉ trang

| Tham số | Ví dụ | Ý nghĩa |
|---|---|---|
| `type` | `type=CONTAINER` | Tab loại |
| `severity` | `severity=HIGH` | Mức độ |
| `status` | `status=OPEN` | Trạng thái |
| `range` | `range=7d` | Khoảng có sẵn (`today`, `7d`, `30d`, `this-month`, `last-month`, …) |
| `from`, `to` | `from=2026-11-01&to=2026-11-20` | Tự chọn ngày (giờ Việt Nam, tính cả hai ngày) |

- Gửi link hay tải lại trang đều giữ nguyên bộ lọc. Đổi bộ lọc thì quay về trang 1.
- Giá trị không đọc được (loại lạ, ngày sai, ngày kết thúc sau hôm nay) được hiểu là "tất cả" — link cũ hay bị sửa tay
  vẫn mở được và **không bao giờ ẩn issue vì một khoảng ngày đọc sai**.
- Logic đọc/ghi nằm ở `web/src/features/operations/issueFilters.ts` (có test).

## 3. Backend: `GET /api/operations/issues`

Thêm hai tham số và một trường trả về:

| | Mô tả |
|---|---|
| `reportedFrom` | Thời điểm (ISO 8601). Lấy issue có `reportedAt >= reportedFrom` |
| `reportedTo` | Thời điểm (ISO 8601). Lấy issue có `reportedAt < reportedTo` (không tính chính mốc này) |
| `countsByType` (response) | Số issue mỗi loại theo mọi bộ lọc **trừ loại**: `{ "CONTAINER": 0, "TRANSPORT": 5, "JOB": 8, … }`. Đủ 6 loại, loại không có thì 0 |

- `reportedTo` không sau `reportedFrom` → lỗi 400 `issue_reported_range_invalid`.
- Web đổi ngày sang thời điểm theo giờ Việt Nam: từ 00:00 ngày đầu đến 00:00 sau ngày cuối, hoặc đến **lúc gửi
  request** nếu khoảng chứa hôm nay (giống Dashboard), nên tự làm mới 30 giây/lần vẫn đếm tới hiện tại.
- `countsByType` tính bằng một lệnh `$group` trên Mongo, áp dụng **cùng quyền xem** như danh sách: Admin đếm mọi
  issue, Technician chỉ issue của robot mình phụ trách / mình báo / được giao, Staff chỉ issue mình báo / được giao.
- Index `reportedAt` đã có sẵn trong `OperationsMongoContext`, không cần thêm. Không có migration (issue nằm ở Mongo).
- Trường mới là tuỳ chọn: app mobile và các chỗ khác gọi API này không phải sửa.

## 4. File thay đổi

| File | Thay đổi |
|---|---|
| `backend/src/Modules/Operations/Features/IssueReports/IssueService.cs` | `ListIssuesQuery` thêm `ReportedFrom/To`; lọc thời gian; đếm theo loại |
| `…/IssueReports/IssueModels.cs` | `ListIssuesResponse.CountsByType`; `IssueListFilters` (kiểm tra khoảng ngày, điền đủ 6 loại) |
| `…/IssueReports/Endpoints.cs` | Nhận `reportedFrom`, `reportedTo` |
| `web/src/shared/api/operations.ts` | `listIssues` gửi `issueType`, `reportedFrom`, `reportedTo`; kiểu `countsByType` |
| `web/src/shared/ui/DateRangePicker.tsx` | Tuỳ chọn `anyTime` ("Mọi lúc"); Dashboard không đổi |
| `web/src/features/operations/issueFilters.ts` | Đọc/ghi bộ lọc trên địa chỉ trang |
| `web/src/features/operations/IssuesPage.tsx` | Tab loại, ô mức độ, bộ chọn ngày, Xóa bộ lọc |
| `web/src/shared/i18n/vi/operations-robots.ts` | Chuỗi tiếng Việt mới |

## 5. Test

- Backend unit `IssueListFiltersTests`: khoảng ngày hợp lệ / sai, đếm đủ 6 loại. Nhóm test Operations: 19 pass.
- Web `issueFilters.test.ts`: đọc bộ lọc, giá trị hỏng → "tất cả", ghi khoảng ngày, xóa bộ lọc. Toàn bộ web: 264 pass,
  `tsc` sạch.
- Lưu ý: `web/node_modules` được cài bằng **pnpm**; chạy test bằng `pnpm exec vitest run` (`npm test`/`npx vitest`
  báo lỗi `Cannot read properties of undefined (reading 'config')` ở mọi file).

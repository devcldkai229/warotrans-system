using WaroTrans.BuildingBlocks.Exceptions;

namespace WaroTrans.Host.Reporting;

/// <summary>
/// The language of the human columns of an export. Codes (section, metric, basis, status) are always English so a
/// spreadsheet can filter on them and a file from either language can be compared; only the labels change.
/// </summary>
public sealed class ReportLanguage
{
    public static readonly ReportLanguage English = new(false);
    public static readonly ReportLanguage Vietnamese = new(true);

    private ReportLanguage(bool vietnamese) => IsVietnamese = vietnamese;

    public bool IsVietnamese { get; }

    public string Code => IsVietnamese ? "vi" : "en";

    public static ReportLanguage Parse(string? lang) => lang?.Trim().ToLowerInvariant() switch
    {
        null or "" or "en" => English,
        "vi" => Vietnamese,
        _ => throw new DomainValidationException("lang must be en or vi.", "report_lang_invalid")
    };

    public string Text(string english, string vietnamese) => IsVietnamese ? vietnamese : english;

    /// <summary>The label of a <c>Section.Metric</c> code; a code without a label is shown as it is.</summary>
    public string Label(string key) =>
        Labels.TryGetValue(key, out var label) ? Text(label.En, label.Vi) : key;

    private static readonly Dictionary<string, (string En, string Vi)> Labels = new(StringComparer.Ordinal)
    {
        ["Report.From"] = ("Period start", "Bắt đầu kỳ"),
        ["Report.To"] = ("Period end (exclusive)", "Kết thúc kỳ (không tính)"),
        ["Report.UtcOffsetMinutes"] = ("Time zone offset", "Độ lệch múi giờ"),
        ["Report.GeneratedAt"] = ("Exported at", "Thời điểm xuất"),
        ["Report.RobotHistoryKeptSince"] = ("Robot history kept since", "Lịch sử robot lưu từ"),

        ["Jobs.Created"] = ("Jobs created", "Công việc đã tạo"),
        ["Jobs.Completed"] = ("Jobs completed", "Công việc hoàn thành"),
        ["Jobs.Failed"] = ("Jobs failed", "Công việc thất bại"),
        ["Jobs.CompletedPreviousPeriod"] = ("Jobs completed, previous period", "Công việc hoàn thành, kỳ trước"),
        ["Jobs.SuccessRate"] = ("Success rate", "Tỷ lệ thành công"),
        ["Jobs.AvgDuration"] = ("Average duration", "Thời lượng trung bình"),
        ["Jobs.AvgWaitToStart"] = ("Average wait to start", "Thời gian chờ bắt đầu trung bình"),
        ["JobsDaily.Completed"] = ("Jobs completed that day", "Công việc hoàn thành trong ngày"),
        ["JobsDaily.Failed"] = ("Jobs failed that day", "Công việc thất bại trong ngày"),
        ["JobsByWorkflow.Completed"] = ("Completed, by workflow", "Hoàn thành, theo quy trình"),
        ["JobsByWorkflow.Failed"] = ("Failed, by workflow", "Thất bại, theo quy trình"),
        ["JobsByWorkflow.AvgDuration"] = ("Average duration, by workflow", "Thời lượng TB, theo quy trình"),
        ["JobFailures.Jobs"] = ("Failed jobs with this code", "Công việc thất bại với mã lỗi này"),

        ["Requests.Submitted"] = ("Requests submitted", "Yêu cầu đã gửi"),
        ["Requests.SubmittedPreviousPeriod"] = ("Requests submitted, previous period", "Yêu cầu đã gửi, kỳ trước"),
        ["Requests.AvgLeadTime"] = ("Average lead time", "Thời gian hoàn thành trung bình"),
        ["RequestsByStatus.Requests"] = ("Submitted requests in this status", "Yêu cầu đã gửi ở trạng thái này"),
        ["RequestsDaily.Submitted"] = ("Requests submitted that day", "Yêu cầu gửi trong ngày"),
        ["RequestsDaily.Completed"] = ("Requests completed that day", "Yêu cầu hoàn thành trong ngày"),

        ["Assignments.Completed"] = ("Assignments completed", "Lượt giao việc hoàn thành"),
        ["Assignments.Reassigned"] = ("Assignments reassigned", "Lượt giao việc bị chuyển robot"),
        ["Assignments.AckTimeouts"] = ("Assignments not acknowledged in time", "Lượt giao việc robot không xác nhận kịp"),
        ["Assignments.RobotOffline"] = ("Assignments lost to a robot going offline", "Lượt giao việc mất do robot mất kết nối"),
        ["Assignments.RobotRejected"] = ("Assignments rejected by the robot", "Lượt giao việc robot từ chối"),
        ["Assignments.Cancelled"] = ("Assignments cancelled", "Lượt giao việc bị hủy"),
        ["Assignments.Failed"] = ("Assignments failed", "Lượt giao việc thất bại"),
        ["RobotJobs.JobsCompleted"] = ("Jobs completed by the robot", "Công việc robot đã hoàn thành"),
        ["RobotJobs.Interrupted"] = ("Assignments interrupted", "Lượt giao việc bị gián đoạn"),

        ["Availability.Coverage"] = ("Share of the period the history covers", "Phần kỳ có dữ liệu lịch sử"),
        ["Availability.Online"] = ("Time online", "Thời gian trực tuyến"),
        ["Availability.Available"] = ("Time able to take work", "Thời gian sẵn sàng nhận việc"),
        ["Availability.Busy"] = ("Time busy with a job", "Thời gian bận chạy công việc"),
        ["Availability.Time"] = ("Time in this status", "Thời gian ở trạng thái này"),

        ["Snapshot.ActiveJobs"] = ("Jobs in this status now", "Công việc đang ở trạng thái này"),
        ["Snapshot.OpenRequests"] = ("Requests still open", "Yêu cầu đang mở"),
        ["Snapshot.RobotsTotal"] = ("Robots registered", "Robot đã đăng ký"),
        ["Snapshot.RobotsEnabled"] = ("Robots enabled", "Robot đang bật"),
        ["Snapshot.RobotsOnline"] = ("Robots online", "Robot trực tuyến"),
        ["Snapshot.RobotsLowBattery"] = ("Robots with low battery", "Robot pin yếu"),
        ["Snapshot.AverageBattery"] = ("Average battery of enabled robots", "Pin trung bình của robot đang bật"),
        ["Snapshot.RobotsInStatus"] = ("Robots in this status now", "Robot đang ở trạng thái này")
    };
}

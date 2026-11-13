using System.Globalization;
using WaroTrans.BuildingBlocks.Reporting;
using WaroTrans.BuildingBlocks.Statistics;
using WaroTrans.Fleet.Features.RobotAvailability;
using WaroTrans.Transportation.Features.RequestReport;
using WaroTrans.WorkflowExecution.Features.JobReport;

namespace WaroTrans.Host.Reporting;

/// <summary>Which rows a number is about. Written in every summary row, so nobody reads a "now" figure as the period's.</summary>
public static class ReportBasis
{
    public const string CreatedInPeriod = "CREATED_IN_PERIOD";
    public const string StartedInPeriod = "STARTED_IN_PERIOD";
    public const string FinishedInPeriod = "FINISHED_IN_PERIOD";
    public const string FinishedInPreviousPeriod = "FINISHED_IN_PREVIOUS_PERIOD";
    public const string SubmittedInPeriod = "SUBMITTED_IN_PERIOD";
    public const string SubmittedInPreviousPeriod = "SUBMITTED_IN_PREVIOUS_PERIOD";
    public const string CompletedInPeriod = "COMPLETED_IN_PERIOD";
    public const string EndedInPeriod = "ENDED_IN_PERIOD";
    public const string TimeInPeriod = "TIME_IN_PERIOD";
    public const string SnapshotAtExport = "SNAPSHOT_AT_EXPORT";
}

/// <summary>FE-20: the files of an export. Times are in the viewer's offset, the one the period was chosen in.</summary>
public static class ReportFiles
{
    public static readonly string[] SummaryColumns = ["Section", "Metric", "Label", "Basis", "Date", "Subject", "Value", "Unit"];

    /// <summary><c>warotrans-summary_2026-10-01_2026-10-31</c>: the first and the last day of the period, both included.</summary>
    public static string FileStem(string dataset, DateTimeOffset from, DateTimeOffset to, int utcOffsetMinutes)
    {
        var range = new StatisticsRange(from, to, utcOffsetMinutes);
        return $"warotrans-{dataset}_{range.LocalDate(from):yyyy-MM-dd}_{range.LocalDate(to.AddTicks(-1)):yyyy-MM-dd}";
    }

    /// <summary>
    /// The summary in long form, one number per row: a spreadsheet filters or pivots it, and adding a figure later does
    /// not move any column. The numbers are the statistics responses as they are; only the success rate is derived.
    /// </summary>
    public static CsvWriter Summary(PeriodReport report, ReportLanguage language)
    {
        var csv = CsvWriter.WithHeader(SummaryColumns);
        var offset = TimeSpan.FromMinutes(report.UtcOffsetMinutes);

        void Add(string section, string metric, string basis, object? value, string unit = "", string? date = null, string? subject = null) =>
            csv.Row(section, metric, language.Label($"{section}.{metric}"), basis, date, subject, value, unit);

        string Local(DateTimeOffset instant) => instant.ToOffset(offset).ToString("yyyy-MM-ddTHH:mm:sszzz", CultureInfo.InvariantCulture);

        Add("Report", "From", "", Local(report.From));
        Add("Report", "To", "", Local(report.To));
        Add("Report", "UtcOffsetMinutes", "", report.UtcOffsetMinutes, "min");
        Add("Report", "GeneratedAt", "", Local(report.GeneratedAt));
        Add("Report", "RobotHistoryKeptSince", "", Local(report.Availability.HistoryKeptSince));

        var jobs = report.Jobs;
        var finished = jobs.Completed + jobs.Failed;
        Add("Jobs", "Created", ReportBasis.CreatedInPeriod, jobs.Created, "jobs");
        Add("Jobs", "Completed", ReportBasis.FinishedInPeriod, jobs.Completed, "jobs");
        Add("Jobs", "Failed", ReportBasis.FinishedInPeriod, jobs.Failed, "jobs");
        Add("Jobs", "CompletedPreviousPeriod", ReportBasis.FinishedInPreviousPeriod, jobs.PreviousCompleted, "jobs");
        Add("Jobs", "SuccessRate", ReportBasis.FinishedInPeriod, finished == 0 ? null : jobs.Completed * 100.0 / finished, "%");
        Add("Jobs", "AvgDuration", ReportBasis.FinishedInPeriod, jobs.AvgDurationSeconds, "s");
        Add("Jobs", "AvgWaitToStart", ReportBasis.StartedInPeriod, jobs.AvgQueueWaitSeconds, "s");
        foreach (var day in jobs.Daily)
        {
            var date = day.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            Add("JobsDaily", "Completed", ReportBasis.FinishedInPeriod, day.Completed, "jobs", date);
            Add("JobsDaily", "Failed", ReportBasis.FinishedInPeriod, day.Failed, "jobs", date);
        }

        foreach (var workflow in jobs.ByWorkflow)
        {
            Add("JobsByWorkflow", "Completed", ReportBasis.FinishedInPeriod, workflow.Completed, "jobs", subject: workflow.WorkflowCode);
            Add("JobsByWorkflow", "Failed", ReportBasis.FinishedInPeriod, workflow.Failed, "jobs", subject: workflow.WorkflowCode);
            Add("JobsByWorkflow", "AvgDuration", ReportBasis.FinishedInPeriod, workflow.AvgDurationSeconds, "s", subject: workflow.WorkflowCode);
        }

        foreach (var failure in jobs.TopFailureCodes)
        {
            Add("JobFailures", "Jobs", ReportBasis.FinishedInPeriod, failure.Count, "jobs", subject: failure.Code);
        }

        var requests = report.Requests;
        Add("Requests", "Submitted", ReportBasis.SubmittedInPeriod, requests.Submitted, "requests");
        Add("Requests", "SubmittedPreviousPeriod", ReportBasis.SubmittedInPreviousPeriod, requests.PreviousSubmitted, "requests");
        Add("Requests", "AvgLeadTime", ReportBasis.CompletedInPeriod, requests.AvgLeadTimeSeconds, "s");
        foreach (var status in requests.ByStatus)
        {
            Add("RequestsByStatus", "Requests", ReportBasis.SubmittedInPeriod, status.Count, "requests", subject: status.Status);
        }

        foreach (var day in requests.Daily)
        {
            var date = day.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            Add("RequestsDaily", "Submitted", ReportBasis.SubmittedInPeriod, day.Submitted, "requests", date);
            Add("RequestsDaily", "Completed", ReportBasis.CompletedInPeriod, day.Completed, "requests", date);
        }

        var assignments = report.Robots.Assignments;
        Add("Assignments", "Completed", ReportBasis.EndedInPeriod, assignments.Completed, "assignments");
        Add("Assignments", "Reassigned", ReportBasis.EndedInPeriod, assignments.Reassigned, "assignments");
        Add("Assignments", "AckTimeouts", ReportBasis.EndedInPeriod, assignments.AckTimeouts, "assignments");
        Add("Assignments", "RobotOffline", ReportBasis.EndedInPeriod, assignments.RobotOffline, "assignments");
        Add("Assignments", "RobotRejected", ReportBasis.EndedInPeriod, assignments.RobotRejected, "assignments");
        Add("Assignments", "Cancelled", ReportBasis.EndedInPeriod, assignments.Cancelled, "assignments");
        Add("Assignments", "Failed", ReportBasis.EndedInPeriod, assignments.Failed, "assignments");
        foreach (var robot in report.Robots.Robots)
        {
            Add("RobotJobs", "JobsCompleted", ReportBasis.EndedInPeriod, robot.JobsCompleted, "jobs", subject: robot.Code);
            Add("RobotJobs", "Interrupted", ReportBasis.EndedInPeriod, robot.Interrupted, "assignments", subject: robot.Code);
        }

        void Availability(RobotAvailabilityFigures figures, string? subject)
        {
            Add("Availability", "Coverage", ReportBasis.TimeInPeriod, figures.CoveragePercent, "%", subject: subject);
            Add("Availability", "Online", ReportBasis.TimeInPeriod, figures.OnlinePercent, "%", subject: subject);
            Add("Availability", "Available", ReportBasis.TimeInPeriod, figures.AvailablePercent, "%", subject: subject);
            Add("Availability", "Busy", ReportBasis.TimeInPeriod, figures.BusyPercent, "%", subject: subject);
            foreach (var status in figures.ByStatus)
            {
                csv.Row("Availability", "Time." + status.Status, language.Label("Availability.Time"), ReportBasis.TimeInPeriod, null,
                    subject, status.Percent, "%");
            }
        }

        Availability(report.Availability.Fleet, "FLEET");
        foreach (var robot in report.Availability.Robots)
        {
            Availability(robot.Figures, robot.Code);
        }

        foreach (var status in jobs.Active)
        {
            Add("Snapshot", "ActiveJobs", ReportBasis.SnapshotAtExport, status.Count, "jobs", subject: status.Status);
        }

        var fleet = report.Robots;
        Add("Snapshot", "OpenRequests", ReportBasis.SnapshotAtExport, requests.Open, "requests");
        Add("Snapshot", "RobotsTotal", ReportBasis.SnapshotAtExport, fleet.Total, "robots");
        Add("Snapshot", "RobotsEnabled", ReportBasis.SnapshotAtExport, fleet.Enabled, "robots");
        Add("Snapshot", "RobotsOnline", ReportBasis.SnapshotAtExport, fleet.Online, "robots");
        Add("Snapshot", "RobotsLowBattery", ReportBasis.SnapshotAtExport, fleet.LowBattery, "robots");
        Add("Snapshot", "AverageBattery", ReportBasis.SnapshotAtExport, fleet.AverageBatteryPercent, "%");
        foreach (var status in fleet.ByStatus)
        {
            Add("Snapshot", "RobotsInStatus", ReportBasis.SnapshotAtExport, status.Count, "robots", subject: status.Status);
        }

        return csv;
    }

    public static CsvWriter Jobs(IReadOnlyList<JobReportRow> rows, IReadOnlyDictionary<Guid, string> robotByJob, int utcOffsetMinutes)
    {
        var csv = CsvWriter.WithHeader(
            "JobNo", "Status", "WorkflowCode", "WorkflowName", "Priority", "Containers", "Robot",
            "CreatedAt", "StartedAt", "FinishedAt", "DurationSeconds", "WaitToStartSeconds", "FailureCode",
            "CreatedInPeriod", "FinishedInPeriod", "CountedInSummary");
        foreach (var job in rows)
        {
            csv.Row(
                job.JobNo,
                job.Status,
                job.WorkflowCode,
                job.WorkflowName,
                job.Priority,
                job.Containers,
                robotByJob.GetValueOrDefault(job.Id),
                LocalTime(job.CreatedAt, utcOffsetMinutes),
                LocalTime(job.StartedAt, utcOffsetMinutes),
                LocalTime(job.FinishedAt, utcOffsetMinutes),
                Seconds(job.StartedAt, job.FinishedAt),
                Seconds(job.CreatedAt, job.StartedAt),
                job.FailureCode,
                job.CreatedInPeriod,
                job.FinishedInPeriod,
                job.CountedInSummary);
        }

        return csv;
    }

    public static CsvWriter Requests(IReadOnlyList<RequestReportRow> rows, int utcOffsetMinutes)
    {
        var csv = CsvWriter.WithHeader(
            "RequestCode", "Status", "Priority", "Containers", "SubmittedAt", "CompletedAt", "LeadTimeSeconds",
            "FailureCode", "SubmittedInPeriod", "CountedInLeadTime");
        foreach (var request in rows)
        {
            csv.Row(
                request.RequestCode,
                request.Status,
                request.Priority,
                request.Containers,
                LocalTime(request.SubmittedAt, utcOffsetMinutes),
                LocalTime(request.CompletedAt, utcOffsetMinutes),
                Seconds(request.SubmittedAt, request.CompletedAt),
                request.FailureCode,
                request.SubmittedInPeriod,
                request.CountedInLeadTime);
        }

        return csv;
    }

    /// <summary>One row per robot: its state now, its work in the period and how its time in the period was spent.</summary>
    public static CsvWriter Robots(PeriodReport report)
    {
        var statuses = report.Availability.Fleet.ByStatus.Select(s => s.Status).ToList();
        var csv = CsvWriter.WithHeader(
            [
                "RobotCode", "RobotName", "Enabled", "StatusNow", "OnlineNow", "BatteryPercentNow",
                "JobsCompleted", "Interrupted", "MeasuredFrom", "CoveragePercent", "OnlinePercent",
                "AvailablePercent", "BusyPercent",
                .. statuses.Select(status => "Percent" + Pascal(status))
            ]);
        var availability = report.Availability.Robots.ToDictionary(r => r.Id);
        foreach (var robot in report.Robots.Robots)
        {
            var figures = availability.GetValueOrDefault(robot.Id);
            csv.Row(
                [
                    robot.Code,
                    robot.Name,
                    robot.IsEnabled,
                    robot.Status,
                    robot.IsOnline,
                    robot.BatteryPercent,
                    robot.JobsCompleted,
                    robot.Interrupted,
                    LocalTime(figures?.MeasuredFrom, report.UtcOffsetMinutes),
                    figures?.Figures.CoveragePercent,
                    figures?.Figures.OnlinePercent,
                    figures?.Figures.AvailablePercent,
                    figures?.Figures.BusyPercent,
                    .. statuses.Select(status => (object?)figures?.Figures.ByStatus.FirstOrDefault(s => s.Status == status)?.Percent)
                ]);
        }

        return csv;
    }

    public static string Readme(PeriodReport report, ReportLanguage language)
    {
        var stem = FileStem("report", report.From, report.To, report.UtcOffsetMinutes);
        return language.IsVietnamese
            ? $"""
               WaroTrans - báo cáo theo kỳ ({stem})

               summary.csv   Tổng hợp, mỗi dòng một con số. Cột Basis cho biết con số tính theo cái gì:
                 CREATED_IN_PERIOD / STARTED_IN_PERIOD / FINISHED_IN_PERIOD  công việc tạo / bắt đầu / kết thúc trong kỳ
                 SUBMITTED_IN_PERIOD / COMPLETED_IN_PERIOD                   yêu cầu gửi / hoàn thành trong kỳ
                 ENDED_IN_PERIOD   lượt giao việc kết thúc trong kỳ
                 TIME_IN_PERIOD    phần trăm thời gian trong kỳ (độ sẵn sàng robot, chỉ tính phần kỳ có lịch sử: xem Coverage)
                 SNAPSHOT_AT_EXPORT  tình trạng tại thời điểm xuất, không phải của kỳ
               jobs.csv      Mọi công việc tạo hoặc kết thúc trong kỳ. CountedInSummary = true là công việc nằm trong số hoàn thành/thất bại
                             của summary (công việc bị hủy được liệt kê nhưng không tính).
               requests.csv  Mọi yêu cầu vận chuyển gửi hoặc hoàn thành trong kỳ.
               robots.csv    Mỗi robot một dòng: tình trạng hiện tại, công việc trong kỳ, thời gian theo trạng thái.

               Giờ trong các file là giờ địa phương, lệch UTC {report.UtcOffsetMinutes} phút. Kỳ gồm thời điểm bắt đầu, không gồm thời điểm kết thúc.
               Số liệu trùng với trang Thống kê cho cùng kỳ.
               """
            : $"""
               WaroTrans - period report ({stem})

               summary.csv   The summary, one number per row. The Basis column says which rows a number is about:
                 CREATED_IN_PERIOD / STARTED_IN_PERIOD / FINISHED_IN_PERIOD  jobs created / started / finished in the period
                 SUBMITTED_IN_PERIOD / COMPLETED_IN_PERIOD                   requests submitted / completed in the period
                 ENDED_IN_PERIOD   robot assignments that ended in the period
                 TIME_IN_PERIOD    share of the period's time (robot availability, over the part the history covers: see Coverage)
                 SNAPSHOT_AT_EXPORT  the state when the file was exported, not the period's
               jobs.csv      Every job created or finished in the period. CountedInSummary = true when the job is in the summary's
                             completed / failed numbers (cancelled jobs are listed but not counted).
               requests.csv  Every transport request submitted or completed in the period.
               robots.csv    One row per robot: its state now, its work in the period and its time per status.

               Times are local, {report.UtcOffsetMinutes} minutes from UTC. The period includes its start and excludes its end.
               The numbers match the Statistics page for the same period.
               """;
    }

    private static string? LocalTime(DateTimeOffset? instant, int utcOffsetMinutes) =>
        instant?.ToOffset(TimeSpan.FromMinutes(utcOffsetMinutes)).ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);

    private static double? Seconds(DateTimeOffset? from, DateTimeOffset? to) =>
        from is { } start && to is { } end ? Math.Max(0, Math.Round((end - start).TotalSeconds)) : null;

    private static string Pascal(string code) =>
        string.Concat(code.Split('_').Select(part => part.Length == 0 ? part : part[0] + part[1..].ToLowerInvariant()));
}

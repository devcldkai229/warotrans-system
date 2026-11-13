using System.IO.Compression;
using System.Text;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Reporting;
using WaroTrans.BuildingBlocks.Statistics;
using WaroTrans.Fleet.Features.RobotReport;
using WaroTrans.Transportation.Features.RequestReport;
using WaroTrans.WorkflowExecution.Features.JobReport;

namespace WaroTrans.Host.Reporting;

/// <summary>
/// FE-20 / UC-32: the period report of the statistics page, to print (JSON for the print view) or to download as CSV,
/// one file per dataset or all of them in a ZIP. Same window rules and same permission as the statistics endpoints;
/// every download is written to the audit log.
/// </summary>
public static class ReportEndpoints
{
    private const string CsvType = "text/csv; charset=utf-8";

    public static IEndpointRouteBuilder MapReportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/reports")
            .RequirePermission(Permissions.StatisticsRead)
            .WithTags("Reports");

        group.MapGet("/period", async (
                DateTimeOffset? from, DateTimeOffset? to, int? utcOffsetMinutes,
                PeriodReportBuilder builder, TimeProvider clock, CancellationToken cancellationToken) =>
            {
                var now = clock.GetUtcNow();
                var range = StatisticsRange.Resolve(from, to, utcOffsetMinutes, now);
                return Results.Ok(await builder.BuildAsync(range, now, cancellationToken));
            })
            .WithName("GetPeriodReport")
            .WithSummary("The period report: job, request and robot statistics plus robot availability");

        group.MapGet("/summary.csv", async (
                DateTimeOffset? from, DateTimeOffset? to, int? utcOffsetMinutes, string? lang,
                PeriodReportBuilder builder, IAuditTrail audit, TimeProvider clock, CancellationToken cancellationToken) =>
            {
                var language = ReportLanguage.Parse(lang);
                var now = clock.GetUtcNow();
                var range = StatisticsRange.Resolve(from, to, utcOffsetMinutes, now);
                var csv = ReportFiles.Summary(await builder.BuildAsync(range, now, cancellationToken), language);
                return await FileAsync(audit, "summary", range, language, csv, cancellationToken);
            })
            .WithName("ExportSummaryReport")
            .WithSummary("The period summary as CSV, one number per row with the basis it is counted on");

        group.MapGet("/jobs.csv", async (
                DateTimeOffset? from, DateTimeOffset? to, int? utcOffsetMinutes, string? lang,
                JobReportReader jobs, RobotReportReader robots, IAuditTrail audit, TimeProvider clock,
                CancellationToken cancellationToken) =>
            {
                var language = ReportLanguage.Parse(lang);
                var range = StatisticsRange.Resolve(from, to, utcOffsetMinutes, clock.GetUtcNow());
                var csv = await JobsCsvAsync(range, jobs, robots, cancellationToken);
                return await FileAsync(audit, "jobs", range, language, csv, cancellationToken);
            })
            .WithName("ExportJobsReport")
            .WithSummary("Every job created or finished in the period, as CSV");

        group.MapGet("/requests.csv", async (
                DateTimeOffset? from, DateTimeOffset? to, int? utcOffsetMinutes, string? lang,
                RequestReportReader requests, IAuditTrail audit, TimeProvider clock, CancellationToken cancellationToken) =>
            {
                var language = ReportLanguage.Parse(lang);
                var range = StatisticsRange.Resolve(from, to, utcOffsetMinutes, clock.GetUtcNow());
                var csv = ReportFiles.Requests(await requests.ReadAsync(range, cancellationToken), range.UtcOffsetMinutes);
                return await FileAsync(audit, "requests", range, language, csv, cancellationToken);
            })
            .WithName("ExportRequestsReport")
            .WithSummary("Every transport request submitted or completed in the period, as CSV");

        group.MapGet("/robots.csv", async (
                DateTimeOffset? from, DateTimeOffset? to, int? utcOffsetMinutes, string? lang,
                PeriodReportBuilder builder, IAuditTrail audit, TimeProvider clock, CancellationToken cancellationToken) =>
            {
                var language = ReportLanguage.Parse(lang);
                var now = clock.GetUtcNow();
                var range = StatisticsRange.Resolve(from, to, utcOffsetMinutes, now);
                var csv = ReportFiles.Robots(await builder.BuildAsync(range, now, cancellationToken));
                return await FileAsync(audit, "robots", range, language, csv, cancellationToken);
            })
            .WithName("ExportRobotsReport")
            .WithSummary("One row per robot with its work and availability in the period, as CSV");

        group.MapGet("/report.zip", async (
                DateTimeOffset? from, DateTimeOffset? to, int? utcOffsetMinutes, string? lang,
                PeriodReportBuilder builder, JobReportReader jobs, RobotReportReader robots, RequestReportReader requests,
                IAuditTrail audit, TimeProvider clock, CancellationToken cancellationToken) =>
            {
                var language = ReportLanguage.Parse(lang);
                var now = clock.GetUtcNow();
                var range = StatisticsRange.Resolve(from, to, utcOffsetMinutes, now);
                var report = await builder.BuildAsync(range, now, cancellationToken);
                var files = new (string Name, CsvWriter Csv)[]
                {
                    ("summary.csv", ReportFiles.Summary(report, language)),
                    ("jobs.csv", await JobsCsvAsync(range, jobs, robots, cancellationToken)),
                    ("requests.csv", ReportFiles.Requests(await requests.ReadAsync(range, cancellationToken), range.UtcOffsetMinutes)),
                    ("robots.csv", ReportFiles.Robots(report))
                };

                using var buffer = new MemoryStream();
                using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
                {
                    foreach (var (name, csv) in files)
                    {
                        Write(zip, name, csv.ToBytes());
                    }

                    Write(zip, "README.txt", [.. Encoding.UTF8.Preamble, .. Encoding.UTF8.GetBytes(ReportFiles.Readme(report, language))]);
                }

                var rows = files.ToDictionary(f => f.Name, f => (object?)f.Csv.DataRows);
                await RecordAsync(audit, "all", "zip", range, language, rows, cancellationToken);
                return Results.File(
                    buffer.ToArray(),
                    "application/zip",
                    ReportFiles.FileStem("report", range.From, range.To, range.UtcOffsetMinutes) + ".zip");
            })
            .WithName("ExportReportArchive")
            .WithSummary("All the period's files (summary, jobs, requests, robots and a README) in one ZIP");

        return endpoints;
    }

    private static async Task<CsvWriter> JobsCsvAsync(
        StatisticsRange range, JobReportReader jobs, RobotReportReader robots, CancellationToken cancellationToken)
    {
        var rows = await jobs.ReadAsync(range, cancellationToken);
        var robotByJob = await robots.LastRobotCodeByJobAsync(rows.Select(r => r.Id).ToList(), cancellationToken);
        return ReportFiles.Jobs(rows, robotByJob, range.UtcOffsetMinutes);
    }

    private static async Task<IResult> FileAsync(
        IAuditTrail audit, string dataset, StatisticsRange range, ReportLanguage language, CsvWriter csv,
        CancellationToken cancellationToken)
    {
        await RecordAsync(audit, dataset, "csv", range, language, csv.DataRows, cancellationToken);
        return Results.File(
            csv.ToBytes(),
            CsvType,
            ReportFiles.FileStem(dataset, range.From, range.To, range.UtcOffsetMinutes) + ".csv");
    }

    private static Task RecordAsync(
        IAuditTrail audit, string dataset, string format, StatisticsRange range, ReportLanguage language, object rows,
        CancellationToken cancellationToken) =>
        audit.RecordAsync(
            new AuditEntry(
                "report.exported",
                "REPORT",
                null,
                After: new Dictionary<string, object?>
                {
                    ["dataset"] = dataset,
                    ["format"] = format,
                    ["from"] = range.From,
                    ["to"] = range.To,
                    ["rows"] = rows
                },
                Context: new Dictionary<string, object?>
                {
                    ["utcOffsetMinutes"] = range.UtcOffsetMinutes,
                    ["lang"] = language.Code
                }),
            cancellationToken);

    private static void Write(ZipArchive zip, string name, byte[] content)
    {
        var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
        using var stream = entry.Open();
        stream.Write(content);
    }
}

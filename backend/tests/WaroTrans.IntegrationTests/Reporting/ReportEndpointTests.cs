using System.Globalization;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.GetRobotStatistics;
using WaroTrans.Fleet.Features.RobotAvailability;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.GetRequestStatistics;
using WaroTrans.Transportation.Persistence;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.GetJobStatistics;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.IntegrationTests.Reporting;

/// <summary>
/// FE-20 / UC-32 (TC-WF04-FE-20-01..03): the period report. The statistics part uses the same fixed window as
/// <c>StatisticsEndpointTests</c>, 2026-03-02 .. 2026-03-09; robot availability needs history that is still kept, so its
/// window is a recent one.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class ReportEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private const string Window = "from=2026-03-02T00:00:00Z&to=2026-03-09T00:00:00Z";

    private static DateTimeOffset At(string iso) => DateTimeOffset.Parse(iso, null, DateTimeStyles.AssumeUniversal);

    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();
        await using var scope = Factory.Services.CreateAsyncScope();
        var mongo = scope.ServiceProvider.GetRequiredService<OperationsMongoContext>();
        await mongo.AuditLogs.DeleteManyAsync(FilterDefinition<AuditLog>.Empty);
    }

    private sealed record Seeded(Guid FailedJobId, Guid CancelledJobId, Guid R1);

    private async Task<Seeded> SeedPeriodAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var workflows = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var workflowId = Guid.NewGuid();
        workflows.Workflows.Add(new Workflow
        {
            Id = workflowId,
            Code = "WF_REPORT",
            VersionNo = 1,
            Name = "Report workflow",
            Status = WorkflowStatus.PUBLISHED,
            CreatedBy = Guid.NewGuid(),
            CreatedAt = At("2026-01-01T00:00:00Z")
        });

        Job NewJob(string no, JobStatus status, string created, string? started = null, string? completed = null, string? failure = null) => new()
        {
            Id = Guid.NewGuid(),
            JobNo = no,
            WorkflowId = workflowId,
            MapVersionId = Guid.NewGuid(),
            ProvisioningKey = Guid.NewGuid().ToString("N"),
            Status = status,
            CreatedAt = At(created),
            StartedAt = started is null ? null : At(started),
            CompletedAt = completed is null ? null : At(completed),
            FailureCode = failure
        };

        var failed = NewJob("JOB-R-3", JobStatus.FAILED, "2026-03-05T08:00:00Z", "2026-03-05T08:05:00Z", "2026-03-05T08:30:00Z", "STEP_TIMEOUT");
        var cancelled = NewJob("JOB-R-4", JobStatus.CANCELLED, "2026-03-06T08:00:00Z", completed: "2026-03-06T08:10:00Z", failure: "job_cancelled");
        workflows.Jobs.AddRange(
            NewJob("JOB-R-1", JobStatus.COMPLETED, "2026-03-03T09:50:00Z", "2026-03-03T10:10:00Z", "2026-03-03T10:40:00Z"),
            NewJob("JOB-R-2", JobStatus.COMPLETED, "2026-03-03T10:50:00Z", "2026-03-03T11:00:00Z", "2026-03-03T11:20:00Z"),
            failed,
            cancelled,
            NewJob("JOB-R-5", JobStatus.COMPLETED, "2026-02-27T08:00:00Z", "2026-02-27T08:10:00Z", "2026-02-27T09:00:00Z"),   // previous period
            NewJob("JOB-R-6", JobStatus.RUNNING, "2026-03-07T08:00:00Z", "2026-03-07T08:01:00Z"),
            NewJob("JOB-R-7", JobStatus.COMPLETED, "2026-03-12T08:00:00Z", "2026-03-12T08:01:00Z", "2026-03-12T09:00:00Z"));  // after
        await workflows.SaveChangesAsync();

        var transport = scope.ServiceProvider.GetRequiredService<TransportationDbContext>();
        TransportRequest NewRequest(string code, TransportRequestStatus status, string submitted, string? completed = null) => new()
        {
            Id = Guid.NewGuid(),
            RequestCode = code,
            WarehouseId = Guid.NewGuid(),
            MapVersionId = Guid.NewGuid(),
            WorkflowId = workflowId,
            RequestedBy = Guid.NewGuid(),
            Status = status,
            PlanSchemaVersion = TransportRequest.CurrentPlanSchemaVersion,
            SubmittedAt = At(submitted),
            CompletedAt = completed is null ? null : At(completed),
            CreatedAt = At(submitted),
            UpdatedAt = At(submitted)
        };
        transport.TransportRequests.AddRange(
            NewRequest("REQ-R-1", TransportRequestStatus.SUBMITTED, "2026-03-03T08:00:00Z"),
            NewRequest("REQ-R-2", TransportRequestStatus.COMPLETED, "2026-03-03T10:00:00Z", "2026-03-03T12:00:00Z"),
            NewRequest("REQ-R-3", TransportRequestStatus.COMPLETED, "2026-02-28T10:00:00Z", "2026-03-02T11:00:00Z"),  // submitted before, completed in
            NewRequest("REQ-R-4", TransportRequestStatus.FAILED, "2026-03-05T10:00:00Z"));
        await transport.SaveChangesAsync();

        var fleet = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var r1 = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RPT-R1", "Robot one", At("2026-01-01T00:00:00Z"));
        (r1.Status, r1.BatteryPercent, r1.IsOnline) = (RobotStatus.AVAILABLE, 80, true);
        var r2 = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RPT-R2", "Robot two", At("2026-01-01T00:00:00Z"));
        (r2.Status, r2.BatteryPercent, r2.IsOnline) = (RobotStatus.CHARGING, 15, true);
        // A fresh heartbeat, or the connectivity monitor takes them offline between two calls of a test.
        r1.LastHeartbeatAt = r2.LastHeartbeatAt = DateTimeOffset.UtcNow;
        fleet.Robots.AddRange(r1, r2);
        var assignment = JobAssignment.CreatePending(failed.Id, r1.Id, At("2026-03-05T08:00:00Z"));
        assignment.TryEnd(AssignmentEndReason.FAILED, At("2026-03-05T08:30:00Z"));
        var done = JobAssignment.CreatePending(Guid.NewGuid(), r1.Id, At("2026-03-03T10:00:00Z"));
        done.TryEnd(AssignmentEndReason.COMPLETED, At("2026-03-03T10:40:00Z"));
        fleet.JobAssignments.AddRange(assignment, done);
        await fleet.SaveChangesAsync();

        return new Seeded(failed.Id, cancelled.Id, r1.Id);
    }

    private static List<string[]> ParseCsv(string text)
    {
        var rows = new List<string[]>();
        var row = new List<string>();
        var cell = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (quoted)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"') { cell.Append('"'); i++; }
                else if (c == '"') quoted = false;
                else cell.Append(c);
            }
            else if (c == '"') quoted = true;
            else if (c == ',') { row.Add(cell.ToString()); cell.Clear(); }
            else if (c == '\r') { }
            else if (c == '\n') { row.Add(cell.ToString()); cell.Clear(); rows.Add([.. row]); row.Clear(); }
            else cell.Append(c);
        }

        return rows;
    }

    private static async Task<List<string[]>> CsvAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes[..3]);
        return ParseCsv(Encoding.UTF8.GetString(bytes[3..]));
    }

    /// <summary>The summary as (Section.Metric, Date, Subject) → Value.</summary>
    private static Dictionary<(string Key, string Date, string Subject), string> Summary(List<string[]> rows)
    {
        Assert.Equal(["Section", "Metric", "Label", "Basis", "Date", "Subject", "Value", "Unit"], rows[0]);
        return rows.Skip(1).ToDictionary(r => ($"{r[0]}.{r[1]}", r[4], r[5]), r => r[6]);
    }

    private static string Number(double? value) =>
        value is null ? "" : Math.Round(value.Value, 2).ToString("0.##", CultureInfo.InvariantCulture);

    [Fact]
    public async Task The_summary_csv_has_the_same_numbers_as_the_statistics_endpoints()
    {
        await SeedPeriodAsync();

        var jobs = (await Client.GetFromJsonAsync<JobStatisticsResponse>($"/api/workflow-execution/statistics/jobs?{Window}", JsonOptions))!;
        var requests = (await Client.GetFromJsonAsync<RequestStatisticsResponse>($"/api/transportation/statistics/requests?{Window}", JsonOptions))!;
        var robots = (await Client.GetFromJsonAsync<RobotStatisticsResponse>($"/api/fleet/statistics/robots?{Window}", JsonOptions))!;
        var response = await Client.GetAsync($"/api/reports/summary.csv?{Window}");
        Assert.StartsWith("text/csv", response.Content.Headers.ContentType!.ToString());
        Assert.Equal("warotrans-summary_2026-03-02_2026-03-08.csv", response.Content.Headers.ContentDisposition!.FileName?.Trim('"'));
        var summary = Summary(await CsvAsync(response));

        string Value(string key, string date = "", string subject = "") => summary[(key, date, subject)];

        Assert.Equal(jobs.Created.ToString(), Value("Jobs.Created"));
        Assert.Equal(jobs.Completed.ToString(), Value("Jobs.Completed"));
        Assert.Equal(jobs.Failed.ToString(), Value("Jobs.Failed"));
        Assert.Equal(jobs.PreviousCompleted.ToString(), Value("Jobs.CompletedPreviousPeriod"));
        Assert.Equal(Number(jobs.AvgDurationSeconds), Value("Jobs.AvgDuration"));
        Assert.Equal(Number(jobs.AvgQueueWaitSeconds), Value("Jobs.AvgWaitToStart"));
        Assert.Equal(Number(jobs.Completed * 100.0 / (jobs.Completed + jobs.Failed)), Value("Jobs.SuccessRate"));
        foreach (var day in jobs.Daily)
        {
            var date = day.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            Assert.Equal(day.Completed.ToString(), Value("JobsDaily.Completed", date));
            Assert.Equal(day.Failed.ToString(), Value("JobsDaily.Failed", date));
        }

        var workflow = Assert.Single(jobs.ByWorkflow);
        Assert.Equal(workflow.Completed.ToString(), Value("JobsByWorkflow.Completed", subject: "WF_REPORT"));
        Assert.Equal(jobs.TopFailureCodes.Single().Count.ToString(), Value("JobFailures.Jobs", subject: "STEP_TIMEOUT"));
        foreach (var active in jobs.Active)
        {
            Assert.Equal(active.Count.ToString(), Value("Snapshot.ActiveJobs", subject: active.Status));
        }

        Assert.Equal(requests.Submitted.ToString(), Value("Requests.Submitted"));
        Assert.Equal(requests.PreviousSubmitted.ToString(), Value("Requests.SubmittedPreviousPeriod"));
        Assert.Equal(Number(requests.AvgLeadTimeSeconds), Value("Requests.AvgLeadTime"));
        Assert.Equal(requests.Open.ToString(), Value("Snapshot.OpenRequests"));
        foreach (var status in requests.ByStatus)
        {
            Assert.Equal(status.Count.ToString(), Value("RequestsByStatus.Requests", subject: status.Status));
        }

        Assert.Equal(robots.Assignments.Completed.ToString(), Value("Assignments.Completed"));
        Assert.Equal(robots.Assignments.Failed.ToString(), Value("Assignments.Failed"));
        Assert.Equal(robots.Online.ToString(), Value("Snapshot.RobotsOnline"));
        Assert.Equal(Number(robots.AverageBatteryPercent), Value("Snapshot.AverageBattery"));
        foreach (var robot in robots.Robots)
        {
            Assert.Equal(robot.JobsCompleted.ToString(), Value("RobotJobs.JobsCompleted", subject: robot.Code));
            Assert.Equal(robot.Interrupted.ToString(), Value("RobotJobs.Interrupted", subject: robot.Code));
        }

        // Concrete numbers, so the test also fails if both sides drift together.
        Assert.Equal(("2", "1"), (Value("Jobs.Completed"), Value("Jobs.Failed")));
    }

    [Fact]
    public async Task Every_summary_row_says_what_it_is_counted_on_and_snapshots_are_kept_apart()
    {
        await SeedPeriodAsync();

        var rows = await CsvAsync(await Client.GetAsync($"/api/reports/summary.csv?{Window}&lang=vi"));

        Assert.All(rows.Skip(1).Where(r => r[0] != "Report"), r => Assert.NotEqual("", r[3]));
        Assert.All(rows.Skip(1).Where(r => r[0] == "Snapshot"), r => Assert.Equal("SNAPSHOT_AT_EXPORT", r[3]));
        Assert.DoesNotContain(rows.Skip(1), r => r[0] != "Snapshot" && r[3] == "SNAPSHOT_AT_EXPORT");
        Assert.Contains(rows, r => r[1] == "Completed" && r[0] == "Jobs" && r[2] == "Công việc hoàn thành");
    }

    [Fact]
    public async Task The_jobs_csv_lists_cancelled_jobs_without_counting_them()
    {
        await SeedPeriodAsync();

        var rows = await CsvAsync(await Client.GetAsync($"/api/reports/jobs.csv?{Window}"));
        var header = rows[0].ToList();
        var byNo = rows.Skip(1).ToDictionary(r => r[0]);

        Assert.Equal(["JOB-R-1", "JOB-R-2", "JOB-R-3", "JOB-R-4", "JOB-R-6"], byNo.Keys.Order());
        string Cell(string jobNo, string column) => byNo[jobNo][header.IndexOf(column)];

        Assert.Equal("false", Cell("JOB-R-4", "CountedInSummary"));
        Assert.Equal("CANCELLED", Cell("JOB-R-4", "Status"));
        Assert.Equal("true", Cell("JOB-R-3", "CountedInSummary"));
        Assert.Equal("RPT-R1", Cell("JOB-R-3", "Robot"));
        Assert.Equal("1500", Cell("JOB-R-3", "DurationSeconds"));
        Assert.Equal("2026-03-05 08:00:00", Cell("JOB-R-3", "CreatedAt"));
        // Still running: listed because it was created in the period, not counted.
        Assert.Equal(("true", "false", "false"), (Cell("JOB-R-6", "CreatedInPeriod"), Cell("JOB-R-6", "FinishedInPeriod"), Cell("JOB-R-6", "CountedInSummary")));

        // Those flagged as counted add up to the summary.
        var stats = (await Client.GetFromJsonAsync<JobStatisticsResponse>($"/api/workflow-execution/statistics/jobs?{Window}", JsonOptions))!;
        Assert.Equal(stats.Completed + stats.Failed, byNo.Values.Count(r => r[header.IndexOf("CountedInSummary")] == "true"));

        var local = await CsvAsync(await Client.GetAsync($"/api/reports/jobs.csv?{Window}&utcOffsetMinutes=420"));
        Assert.Equal("2026-03-05 15:00:00", local.Single(r => r[0] == "JOB-R-3")[header.IndexOf("CreatedAt")]);
    }

    [Fact]
    public async Task The_requests_csv_flags_what_is_in_the_lead_time()
    {
        await SeedPeriodAsync();

        var rows = await CsvAsync(await Client.GetAsync($"/api/reports/requests.csv?{Window}"));
        var header = rows[0].ToList();
        var byCode = rows.Skip(1).ToDictionary(r => r[0]);

        Assert.Equal(["REQ-R-1", "REQ-R-2", "REQ-R-3", "REQ-R-4"], byCode.Keys.Order());
        Assert.Equal(("false", "true"), (byCode["REQ-R-3"][header.IndexOf("SubmittedInPeriod")], byCode["REQ-R-3"][header.IndexOf("CountedInLeadTime")]));
        Assert.Equal("7200", byCode["REQ-R-2"][header.IndexOf("LeadTimeSeconds")]);
    }

    [Fact]
    public async Task A_period_without_data_gives_files_with_only_a_header_and_a_summary_of_zeros()
    {
        const string empty = "from=2025-06-01T00:00:00Z&to=2025-06-08T00:00:00Z";

        var jobs = await CsvAsync(await Client.GetAsync($"/api/reports/jobs.csv?{empty}"));
        var requests = await CsvAsync(await Client.GetAsync($"/api/reports/requests.csv?{empty}"));
        var summary = Summary(await CsvAsync(await Client.GetAsync($"/api/reports/summary.csv?{empty}")));

        Assert.Single(jobs);
        Assert.Single(requests);
        Assert.Equal("0", summary[("Jobs.Completed", "", "")]);
        Assert.Equal("", summary[("Jobs.AvgDuration", "", "")]);
    }

    [Fact]
    public async Task Robot_availability_is_replayed_from_the_state_history()
    {
        // A recent window, whole seconds, so it is inside the kept history: 10 hours ending two days ago.
        var from = DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.AddDays(-3).ToUnixTimeSeconds());
        var to = from.AddHours(10);
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RPT-AV", "Availability", from.AddDays(-150));
            (robot.Status, robot.IsOnline) = (RobotStatus.AVAILABLE, true);
            db.Robots.Add(robot);
            RobotStateEvent Event(double hours, RobotStatus fromStatus, RobotStatus toStatus, string reason) => new()
            {
                Id = Guid.NewGuid(),
                RobotId = robot.Id,
                FromStatus = fromStatus,
                ToStatus = toStatus,
                Reason = reason,
                Source = RobotStateEventSource.SYSTEM,
                OccurredAt = from.AddHours(hours)
            };
            db.RobotStateEvents.AddRange(
                Event(-1, RobotStatus.OFFLINE, RobotStatus.AVAILABLE, "status,online"),
                Event(2, RobotStatus.AVAILABLE, RobotStatus.EXECUTING, "status"),
                Event(5, RobotStatus.EXECUTING, RobotStatus.AVAILABLE, "status"),
                Event(7, RobotStatus.AVAILABLE, RobotStatus.AVAILABLE, "offline"),
                Event(8, RobotStatus.AVAILABLE, RobotStatus.AVAILABLE, "online"));
            await db.SaveChangesAsync();
        }

        var window = $"from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(to.ToString("O"))}";
        var availability = (await Client.GetFromJsonAsync<RobotAvailabilityResponse>($"/api/fleet/statistics/availability?{window}", JsonOptions))!;

        var row = Assert.Single(availability.Robots);
        Assert.Equal((100, 90, 90, 30), (row.Figures.CoveragePercent, row.Figures.OnlinePercent, row.Figures.AvailablePercent, row.Figures.BusyPercent));
        Assert.Equal(30, row.Figures.ByStatus.Single(s => s.Status == "EXECUTING").Percent);
        Assert.Equal(10, row.Figures.ByStatus.Single(s => s.Status == "OFFLINE").Percent);
        Assert.Equal(90, availability.Fleet.AvailablePercent);

        var summary = Summary(await CsvAsync(await Client.GetAsync($"/api/reports/summary.csv?{window}")));
        Assert.Equal("90", summary[("Availability.Available", "", "RPT-AV")]);
        Assert.Equal("90", summary[("Availability.Available", "", "FLEET")]);
        Assert.Equal("30", summary[("Availability.Time.EXECUTING", "", "RPT-AV")]);

        var robots = await CsvAsync(await Client.GetAsync($"/api/reports/robots.csv?{window}"));
        var header = robots[0].ToList();
        Assert.Equal("90", robots[1][header.IndexOf("AvailablePercent")]);
        Assert.Equal("30", robots[1][header.IndexOf("PercentExecuting")]);

        // Further back than the history is kept (the robot is older than that): only the kept part is measured, and
        // the row says how much of the period that is.
        var old = $"from={Uri.EscapeDataString(DateTimeOffset.UtcNow.AddDays(-200).ToString("O"))}";
        var partial = (await Client.GetFromJsonAsync<RobotAvailabilityResponse>($"/api/fleet/statistics/availability?{old}&to={Uri.EscapeDataString(to.ToString("O"))}", JsonOptions))!;
        Assert.InRange(partial.Robots.Single().Figures.CoveragePercent!.Value, 1, 99);
    }

    [Fact]
    public async Task The_zip_holds_every_file_and_a_readme()
    {
        await SeedPeriodAsync();

        var response = await Client.GetAsync($"/api/reports/report.zip?{Window}&lang=vi");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/zip", response.Content.Headers.ContentType!.MediaType);
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        Assert.Equal(["README.txt", "jobs.csv", "requests.csv", "robots.csv", "summary.csv"], zip.Entries.Select(e => e.FullName).Order(StringComparer.Ordinal));
        using var readme = new StreamReader(zip.GetEntry("README.txt")!.Open(), Encoding.UTF8);
        Assert.Contains("SNAPSHOT_AT_EXPORT", await readme.ReadToEndAsync());
    }

    [Fact]
    public async Task Every_download_is_in_the_audit_log()
    {
        await Client.GetAsync($"/api/reports/summary.csv?{Window}");
        await Client.GetAsync($"/api/reports/jobs.csv?{Window}");

        await using var scope = Factory.Services.CreateAsyncScope();
        var mongo = scope.ServiceProvider.GetRequiredService<OperationsMongoContext>();
        var entries = await mongo.AuditLogs.Find(a => a.Action == "report.exported").ToListAsync();

        Assert.Equal(2, entries.Count);
        Assert.Contains(entries, e => e.Entity.Type == "REPORT" && e.After!["dataset"].AsString == "jobs" && e.ActorUsername != null);
    }

    [Theory]
    [InlineData("/api/reports/period")]
    [InlineData("/api/reports/summary.csv")]
    [InlineData("/api/reports/jobs.csv")]
    [InlineData("/api/reports/requests.csv")]
    [InlineData("/api/reports/robots.csv")]
    [InlineData("/api/reports/report.zip")]
    [InlineData("/api/fleet/statistics/availability")]
    public async Task Reports_need_a_sane_window(string path)
    {
        var backwards = await Client.GetAsync($"{path}?from=2026-03-09T00:00:00Z&to=2026-03-02T00:00:00Z");
        Assert.Equal(HttpStatusCode.BadRequest, backwards.StatusCode);

        var tooLong = await Client.GetAsync($"{path}?from=2024-01-01T00:00:00Z&to=2026-01-01T00:00:00Z");
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await Client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task An_unknown_language_is_refused()
    {
        var response = await Client.GetAsync($"/api/reports/summary.csv?{Window}&lang=fr");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData(AccountRole.STAFF)]
    [InlineData(AccountRole.TECHNICIAN)]
    public async Task Only_an_admin_may_export(AccountRole role)
    {
        await Factory.CreateAccountAsync("reader", role);
        var client = CreateAnonymousClient();
        var session = await client.LoginAsync("reader");

        foreach (var path in new[] { "/api/reports/period", "/api/reports/summary.csv", "/api/reports/report.zip", "/api/fleet/statistics/availability" })
        {
            var response = await client.GetWithTokenAsync($"{path}?{Window}", session.AccessToken);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.NotEqual("text/csv", response.Content.Headers.ContentType?.MediaType);
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await CreateAnonymousClient().GetAsync("/api/reports/summary.csv")).StatusCode);
    }

    [Fact]
    public async Task The_period_report_is_the_statistics_responses_together()
    {
        await SeedPeriodAsync();

        var report = await Client.GetFromJsonAsync<JsonElement>($"/api/reports/period?{Window}&utcOffsetMinutes=420");
        var jobs = await Client.GetFromJsonAsync<JsonElement>($"/api/workflow-execution/statistics/jobs?{Window}&utcOffsetMinutes=420");

        Assert.Equal(420, report.GetProperty("utcOffsetMinutes").GetInt32());
        Assert.Equal(jobs.GetRawText(), report.GetProperty("jobs").GetRawText());
        Assert.True(report.TryGetProperty("availability", out _));
    }
}

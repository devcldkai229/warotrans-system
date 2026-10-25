using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.GetRobotStatistics;
using WaroTrans.Fleet.Persistence;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.GetRequestStatistics;
using WaroTrans.Transportation.Persistence;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.GetJobStatistics;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.IntegrationTests.Statistics;

/// <summary>
/// The admin dashboard endpoints. Every test seeds rows at fixed dates and asks for an explicit window, so the numbers
/// below can be checked by hand: the window is 2026-03-02 .. 2026-03-09 (7 days), the "previous period" 02-23 .. 03-02.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class StatisticsEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private const string Window = "from=2026-03-02T00:00:00Z&to=2026-03-09T00:00:00Z";

    private static DateTimeOffset At(string iso) => DateTimeOffset.Parse(iso, null, System.Globalization.DateTimeStyles.AssumeUniversal);

    private static Job NewJob(Guid workflowId, JobStatus status, DateTimeOffset created) => new()
    {
        Id = Guid.NewGuid(),
        JobNo = "JOB-STAT-" + Guid.NewGuid().ToString("N")[..8],
        WorkflowId = workflowId,
        MapVersionId = Guid.NewGuid(),
        ProvisioningKey = Guid.NewGuid().ToString("N"),
        Status = status,
        CreatedAt = created
    };

    [Fact]
    public async Task Job_statistics_count_finished_jobs_in_the_window_and_active_jobs_now()
    {
        var workflowId = Guid.NewGuid();
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            db.Workflows.Add(new Workflow
            {
                Id = workflowId,
                Code = "WF_STAT",
                VersionNo = 1,
                Name = "Statistics workflow",
                Status = WorkflowStatus.PUBLISHED,
                CreatedBy = Guid.NewGuid(),
                CreatedAt = At("2026-01-01T00:00:00Z")
            });

            var j1 = NewJob(workflowId, JobStatus.COMPLETED, At("2026-03-03T09:50:00Z"));
            (j1.QueuedAt, j1.StartedAt, j1.CompletedAt) = (At("2026-03-03T10:00:00Z"), At("2026-03-03T10:10:00Z"), At("2026-03-03T10:40:00Z"));
            var j2 = NewJob(workflowId, JobStatus.COMPLETED, At("2026-03-03T10:50:00Z"));
            (j2.QueuedAt, j2.StartedAt, j2.CompletedAt) = (At("2026-03-03T10:55:00Z"), At("2026-03-03T11:00:00Z"), At("2026-03-03T11:20:00Z"));
            // Finished 20:00 UTC: still 03-03 in UTC, already 03-04 for a viewer at UTC+7. No start time, so no duration.
            var j3 = NewJob(workflowId, JobStatus.COMPLETED, At("2026-03-03T19:00:00Z"));
            j3.CompletedAt = At("2026-03-03T20:00:00Z");
            var failed = NewJob(workflowId, JobStatus.FAILED, At("2026-03-05T08:00:00Z"));
            (failed.CompletedAt, failed.FailureCode) = (At("2026-03-05T08:30:00Z"), "STEP_TIMEOUT");
            var previous = NewJob(workflowId, JobStatus.COMPLETED, At("2026-02-27T08:00:00Z"));
            previous.CompletedAt = At("2026-02-27T09:00:00Z");
            var later = NewJob(workflowId, JobStatus.COMPLETED, At("2026-03-12T08:00:00Z"));
            later.CompletedAt = At("2026-03-12T09:00:00Z");
            var running = NewJob(workflowId, JobStatus.RUNNING, At("2026-03-06T08:00:00Z"));

            db.Jobs.AddRange(j1, j2, j3, failed, previous, later, running);
            await db.SaveChangesAsync();
        }

        var stats = (await (await Client.GetAsync($"/api/workflow-execution/statistics/jobs?{Window}"))
            .Content.ReadFromJsonAsync<JobStatisticsResponse>(JsonOptions))!;

        Assert.Equal(3, stats.Completed);
        Assert.Equal(1, stats.Failed);
        Assert.Equal(1, stats.PreviousCompleted);
        Assert.Equal(1500, stats.AvgDurationSeconds);      // (1800 + 1200) / 2: only jobs with a start time
        Assert.Equal(900, stats.AvgQueueWaitSeconds);      // created → started: (1200 + 600) / 2
        Assert.Equal(1, stats.Active.Single(a => a.Status == "RUNNING").Count);
        Assert.Equal(0, stats.Active.Single(a => a.Status == "PAUSED").Count);

        var workflow = Assert.Single(stats.ByWorkflow);
        Assert.Equal("WF_STAT", workflow.WorkflowCode);
        Assert.Equal((3, 1), (workflow.Completed, workflow.Failed));

        Assert.Equal(7, stats.Daily.Count);
        Assert.Equal(3, stats.Daily.Single(d => d.Date == new DateOnly(2026, 3, 3)).Completed);
        Assert.Equal(1, stats.Daily.Single(d => d.Date == new DateOnly(2026, 3, 5)).Failed);
        var code = Assert.Single(stats.TopFailureCodes);
        Assert.Equal(("STEP_TIMEOUT", 1), (code.Code, code.Count));

        var seven = (await (await Client.GetAsync($"/api/workflow-execution/statistics/jobs?{Window}&utcOffsetMinutes=420"))
            .Content.ReadFromJsonAsync<JobStatisticsResponse>(JsonOptions))!;
        Assert.Equal(2, seven.Daily.Single(d => d.Date == new DateOnly(2026, 3, 3)).Completed);
        Assert.Equal(1, seven.Daily.Single(d => d.Date == new DateOnly(2026, 3, 4)).Completed);
    }

    [Fact]
    public async Task Robot_statistics_report_the_fleet_now_and_how_assignments_ended()
    {
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var now = At("2026-03-01T00:00:00Z");
            Robot NewRobot(string code, RobotStatus status, decimal battery, bool enabled, bool online)
            {
                var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), code, "Robot " + code, now);
                (robot.Status, robot.BatteryPercent, robot.IsEnabled, robot.IsOnline) = (status, battery, enabled, online);
                return robot;
            }

            var r1 = NewRobot("STAT-R1", RobotStatus.AVAILABLE, 80, true, true);
            var r2 = NewRobot("STAT-R2", RobotStatus.CHARGING, 15, true, true);
            var r3 = NewRobot("STAT-R3", RobotStatus.OFFLINE, 5, false, false);
            db.Robots.AddRange(r1, r2, r3);

            JobAssignment Ended(Robot robot, AssignmentEndReason reason, string endedAt)
            {
                var assignment = JobAssignment.CreatePending(Guid.NewGuid(), robot.Id, At(endedAt).AddMinutes(-30));
                assignment.TryEnd(reason, At(endedAt));
                return assignment;
            }

            db.JobAssignments.AddRange(
                Ended(r1, AssignmentEndReason.COMPLETED, "2026-03-03T10:00:00Z"),
                Ended(r1, AssignmentEndReason.COMPLETED, "2026-03-04T10:00:00Z"),
                Ended(r1, AssignmentEndReason.REASSIGNED, "2026-03-05T10:00:00Z"),
                Ended(r2, AssignmentEndReason.ACK_TIMEOUT, "2026-03-06T10:00:00Z"),
                Ended(r1, AssignmentEndReason.COMPLETED, "2026-02-20T10:00:00Z"));   // before the window
            await db.SaveChangesAsync();
        }

        var stats = (await (await Client.GetAsync($"/api/fleet/statistics/robots?{Window}"))
            .Content.ReadFromJsonAsync<RobotStatisticsResponse>(JsonOptions))!;

        Assert.Equal((3, 2, 2), (stats.Total, stats.Enabled, stats.Online));
        Assert.Equal(1, stats.LowBattery);                  // R2 at 15 %; R3 is disabled, so it does not count
        Assert.Equal(47.5, stats.AverageBatteryPercent);    // (80 + 15) / 2 over enabled robots
        Assert.Equal(1, stats.ByStatus.Single(s => s.Status == "CHARGING").Count);
        Assert.Equal(1, stats.ByStatus.Single(s => s.Status == "OFFLINE").Count);
        Assert.Equal((2, 1, 1), (stats.Assignments.Completed, stats.Assignments.Reassigned, stats.Assignments.AckTimeouts));

        var first = stats.Robots.Single(r => r.Code == "STAT-R1");
        Assert.Equal((2, 1), (first.JobsCompleted, first.Interrupted));
        var second = stats.Robots.Single(r => r.Code == "STAT-R2");
        Assert.Equal((0, 1), (second.JobsCompleted, second.Interrupted));
    }

    [Fact]
    public async Task Request_statistics_count_submitted_requests_and_the_ones_still_open()
    {
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TransportationDbContext>();
            TransportRequest NewRequest(TransportRequestStatus status, string submitted, string? completed = null) => new()
            {
                Id = Guid.NewGuid(),
                RequestCode = "REQ-STAT-" + Guid.NewGuid().ToString("N")[..8],
                WarehouseId = Guid.NewGuid(),
                MapVersionId = Guid.NewGuid(),
                WorkflowId = Guid.NewGuid(),
                RequestedBy = Guid.NewGuid(),
                Status = status,
                PlanSchemaVersion = TransportRequest.CurrentPlanSchemaVersion,
                SubmittedAt = At(submitted),
                CompletedAt = completed is null ? null : At(completed),
                CreatedAt = At(submitted),
                UpdatedAt = At(submitted)
            };

            db.TransportRequests.AddRange(
                NewRequest(TransportRequestStatus.SUBMITTED, "2026-03-03T08:00:00Z"),
                NewRequest(TransportRequestStatus.COMPLETED, "2026-03-03T10:00:00Z", "2026-03-03T12:00:00Z"),   // 2 h
                NewRequest(TransportRequestStatus.COMPLETED, "2026-03-04T10:00:00Z", "2026-03-04T11:00:00Z"),   // 1 h
                NewRequest(TransportRequestStatus.FAILED, "2026-03-05T10:00:00Z"),
                NewRequest(TransportRequestStatus.COMPLETED, "2026-02-28T10:00:00Z", "2026-02-28T11:00:00Z"),   // previous period
                NewRequest(TransportRequestStatus.IN_PROGRESS, "2026-03-20T10:00:00Z"));                        // after the window, still open
            await db.SaveChangesAsync();
        }

        var stats = (await (await Client.GetAsync($"/api/transportation/statistics/requests?{Window}"))
            .Content.ReadFromJsonAsync<RequestStatisticsResponse>(JsonOptions))!;

        Assert.Equal(4, stats.Submitted);
        Assert.Equal(1, stats.PreviousSubmitted);
        Assert.Equal(2, stats.Open);                        // the SUBMITTED one and the IN_PROGRESS one
        Assert.Equal(5400, stats.AvgLeadTimeSeconds);       // (7200 + 3600) / 2
        Assert.Equal(1, stats.ByStatus.Single(s => s.Status == "SUBMITTED").Count);
        Assert.Equal(2, stats.ByStatus.Single(s => s.Status == "COMPLETED").Count);
        Assert.Equal(1, stats.ByStatus.Single(s => s.Status == "FAILED").Count);

        var march3 = stats.Daily.Single(d => d.Date == new DateOnly(2026, 3, 3));
        Assert.Equal((2, 1), (march3.Submitted, march3.Completed));
        var march4 = stats.Daily.Single(d => d.Date == new DateOnly(2026, 3, 4));
        Assert.Equal((1, 1), (march4.Submitted, march4.Completed));
    }

    [Theory]
    [InlineData("/api/workflow-execution/statistics/jobs")]
    [InlineData("/api/fleet/statistics/robots")]
    [InlineData("/api/transportation/statistics/requests")]
    public async Task Statistics_need_a_signed_in_admin_and_a_sane_window(string path)
    {
        var anonymous = await CreateAnonymousClient().GetAsync(path);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        var backwards = await Client.GetAsync($"{path}?from=2026-03-09T00:00:00Z&to=2026-03-02T00:00:00Z");
        Assert.Equal(HttpStatusCode.BadRequest, backwards.StatusCode);

        var tooLong = await Client.GetAsync($"{path}?from=2024-01-01T00:00:00Z&to=2026-01-01T00:00:00Z");
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);

        var defaults = await Client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, defaults.StatusCode);
    }
}

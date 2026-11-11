using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.IntegrationTests.Transportation;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.IntegrationTests.WorkflowExecution.Dispatch;

/// <summary>FL-04 one robot per Job and one Job per robot, BOTH-01 what a robot is doing, BOTH-03 the decision log.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class RobotAssignmentEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Root = "/api/workflow-execution";
    private const string Jobs = Root + "/jobs";

    private async Task<(Guid JobId, TransportRequestScenario.Seed Seed)> QueuedJobAsync()
    {
        var seed = await TransportRequestScenario.SeedAsync(Factory.Services, Client, "CTN-" + Guid.NewGuid().ToString("N")[..8]);
        var workflowId = await TransportRequestScenario.CreatePublishedWorkflowAsync(Client);
        var requestId = await TransportRequestScenario.SubmitAsync(Client, seed, workflowId);
        var queued = await (await Client.PostAsync($"/api/transportation/transport-requests/{requestId}/queue", null))
            .Content.ReadFromJsonAsync<JsonElement>();
        return (queued.GetProperty("jobs")[0].GetProperty("jobId").GetGuid(), seed);
    }

    private async Task<Guid> SeedRobotAsync(TransportRequestScenario.Seed seed, decimal? battery = 90m)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = Robot.Register(seed.WarehouseId, seed.MapVersionId, "RBT-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), "R", DateTimeOffset.UtcNow);
        robot.IsOnline = true;
        robot.Status = RobotStatus.AVAILABLE;
        robot.LocalizationStatus = LocalizationStatus.LOCALIZED;
        robot.LastHeartbeatAt = DateTimeOffset.UtcNow;
        robot.LastTelemetryAt = DateTimeOffset.UtcNow;
        if (battery is { } value)
        {
            robot.BatteryPercent = value;
            robot.BatteryMeasuredAt = DateTimeOffset.UtcNow;
        }

        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot.Id;
    }

    private async Task<List<JobRobotAssignment>> AssignmentsAsync(Guid jobId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>().JobRobotAssignments.AsNoTracking()
            .Where(a => a.JobId == jobId)
            .OrderBy(a => a.StartedAt)
            .ToListAsync();
    }

    /// <summary>
    /// A Job that holds a robot and stays there. The scenario's map has no traffic graph, so a real dispatch ends at the
    /// first MOVE (traffic_path_unavailable), which is what the first test below relies on.
    /// </summary>
    private async Task HoldAsync(Guid jobId, Guid robotId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var job = await db.Jobs.SingleAsync(j => j.Id == jobId);
        job.Status = JobStatus.PAUSED;
        job.StartedAt = DateTimeOffset.UtcNow;
        job.ContextValues = new Dictionary<string, JsonElement>(job.ContextValues)
        {
            ["assignedRobotId"] = JsonSerializer.SerializeToElement(robotId)
        };
        db.JobRobotAssignments.Add(new JobRobotAssignment { Id = Guid.NewGuid(), JobId = jobId, RobotId = robotId, StartedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
    }

    private Task<HttpResponseMessage> DispatchAsync(Guid jobId, object body) => Client.PostAsJsonAsync($"{Jobs}/{jobId}/dispatch", body);

    private async Task<JsonElement> DecisionsAsync(Guid jobId) =>
        await Client.GetFromJsonAsync<JsonElement>($"{Jobs}/{jobId}/dispatch-decisions");

    [Fact]
    public async Task A_dispatch_records_the_robot_and_a_job_that_ends_lets_it_go()
    {
        var (jobId, seed) = await QueuedJobAsync();
        var robotId = await SeedRobotAsync(seed);

        Assert.Equal(HttpStatusCode.OK, (await DispatchAsync(jobId, new { robotId })).StatusCode);

        var row = Assert.Single(await AssignmentsAsync(jobId));
        Assert.Equal(robotId, row.RobotId);
        Assert.Equal(JobRobotAssignmentReasons.Start, row.StartReason);
        Assert.NotNull(row.EndedAt);
        Assert.Equal(nameof(JobStatus.FAILED), row.EndReason);
    }

    [Fact]
    public async Task A_cancel_closes_the_assignment()
    {
        var (jobId, seed) = await QueuedJobAsync();
        await HoldAsync(jobId, await SeedRobotAsync(seed));

        Assert.Equal(HttpStatusCode.OK, (await Client.PostAsJsonAsync($"{Jobs}/{jobId}/cancel", new { reason = "test" })).StatusCode);

        var closed = Assert.Single(await AssignmentsAsync(jobId));
        Assert.NotNull(closed.EndedAt);
        Assert.Equal(nameof(JobStatus.CANCELLED), closed.EndReason);
    }

    [Fact]
    public async Task The_database_refuses_a_second_live_job_on_a_robot_and_a_second_robot_on_a_job()
    {
        var (first, seed) = await QueuedJobAsync();
        var (second, _) = await QueuedJobAsync();
        var robotId = await SeedRobotAsync(seed);
        await HoldAsync(first, robotId);

        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();

        db.JobRobotAssignments.Add(new JobRobotAssignment { Id = Guid.NewGuid(), JobId = second, RobotId = robotId, StartedAt = DateTimeOffset.UtcNow });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();

        db.JobRobotAssignments.Add(new JobRobotAssignment { Id = Guid.NewGuid(), JobId = first, RobotId = Guid.NewGuid(), StartedAt = DateTimeOffset.UtcNow });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task A_robot_held_by_another_job_is_refused_and_the_refusal_is_in_the_history()
    {
        var (jobId, seed) = await QueuedJobAsync();
        var (other, _) = await QueuedJobAsync();
        var robotId = await SeedRobotAsync(seed);
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            db.JobRobotAssignments.Add(new JobRobotAssignment { Id = Guid.NewGuid(), JobId = other, RobotId = robotId, StartedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }

        var refused = await DispatchAsync(jobId, new { robotId });

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("robot_assigned_to_other_job", await refused.ReadErrorCodeAsync());
        var decision = (await DecisionsAsync(jobId))[0];
        Assert.Equal("REFUSED", decision.GetProperty("type").GetString());
        Assert.Equal(robotId, decision.GetProperty("selectedRobotId").GetGuid());
        Assert.Equal("robot_assigned_to_other_job", decision.GetProperty("refusalCode").GetString());
        Assert.Empty(await AssignmentsAsync(jobId));
    }

    [Fact]
    public async Task Waiting_for_a_robot_writes_one_decision_until_the_reasons_change()
    {
        var (jobId, seed) = await QueuedJobAsync();
        await SeedRobotAsync(seed, battery: 12m);

        await DispatchAsync(jobId, new { });
        await DispatchAsync(jobId, new { });
        await DispatchAsync(jobId, new { });
        Assert.Equal(1, (await DecisionsAsync(jobId)).GetArrayLength());

        await SeedRobotAsync(seed, battery: 11m);
        await DispatchAsync(jobId, new { });
        Assert.Equal(2, (await DecisionsAsync(jobId)).GetArrayLength());
    }

    [Fact]
    public async Task A_job_moved_to_another_robot_keeps_its_history_in_one_job()
    {
        var (jobId, seed) = await QueuedJobAsync();
        var a = await SeedRobotAsync(seed);
        var b = await SeedRobotAsync(seed);
        await HoldAsync(jobId, a);

        var moved = await Client.PostAsJsonAsync($"{Jobs}/{jobId}/resume", new { robotId = b });

        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        var rows = await AssignmentsAsync(jobId);
        Assert.Equal(2, rows.Count);
        var old = Assert.Single(rows, r => r.RobotId == a);
        Assert.Equal(JobRobotAssignmentReasons.Reassigned, old.EndReason);
        var next = Assert.Single(rows, r => r.RobotId == b);
        Assert.Equal(JobRobotAssignmentReasons.Reassign, next.StartReason);
    }

    [Fact]
    public async Task Moving_a_job_with_cargo_on_board_is_refused_and_is_not_recorded_as_selected()
    {
        var (jobId, seed) = await QueuedJobAsync();
        var a = await SeedRobotAsync(seed);
        var b = await SeedRobotAsync(seed);
        await HoldAsync(jobId, a);
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            await db.JobContainers.Where(c => c.JobId == jobId)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, JobContainerStatus.ONBOARD));
        }

        var refused = await Client.PostAsJsonAsync($"{Jobs}/{jobId}/resume", new { robotId = b });

        Assert.Equal("payload_recovery_required", await refused.ReadErrorCodeAsync());
        var decision = (await DecisionsAsync(jobId))[0];
        Assert.Equal("REFUSED", decision.GetProperty("type").GetString());
        Assert.Equal(a, Assert.Single(await AssignmentsAsync(jobId), r => r.EndedAt == null).RobotId);
    }

    [Fact]
    public async Task Activity_shows_the_job_of_a_busy_robot_and_nothing_for_an_idle_one()
    {
        var (jobId, seed) = await QueuedJobAsync();
        var busy = await SeedRobotAsync(seed);
        var idle = await SeedRobotAsync(seed);
        await HoldAsync(jobId, busy);

        var one = (await Client.GetFromJsonAsync<JsonElement>($"{Root}/robots/{busy}/activity")).GetProperty("activity");
        Assert.Equal(jobId, one.GetProperty("jobId").GetGuid());
        Assert.Equal("PAUSED", one.GetProperty("jobStatus").GetString());
        Assert.NotEqual(JsonValueKind.Null, one.GetProperty("currentStep").ValueKind);
        Assert.NotEmpty(one.GetProperty("stepKey", "currentStep").GetString()!);
        Assert.NotEmpty(one.GetProperty("containers").EnumerateArray());
        Assert.False(string.IsNullOrEmpty(one.GetProperty("requestCode").GetString()));
        Assert.True(one.TryGetProperty("asOf", out _));

        var none = await Client.GetAsync($"{Root}/robots/{idle}/activity");
        Assert.Equal(HttpStatusCode.OK, none.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await none.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("activity").ValueKind);

        var list = await Client.GetFromJsonAsync<JsonElement>($"{Root}/robots/activity");
        var item = Assert.Single(list.GetProperty("items").EnumerateArray());
        Assert.Equal(busy, item.GetProperty("robotId").GetGuid());

        await Client.PostAsJsonAsync($"{Jobs}/{jobId}/cancel", new { reason = "test" });
        Assert.Empty((await Client.GetFromJsonAsync<JsonElement>($"{Root}/robots/activity")).GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task A_technician_does_not_see_the_activity_of_a_robot_outside_their_scope()
    {
        var (jobId, seed) = await QueuedJobAsync();
        var robotId = await SeedRobotAsync(seed);
        await HoldAsync(jobId, robotId);
        await Factory.CreateAccountAsync("activity_tech", AccountRole.TECHNICIAN);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync("activity_tech")).AccessToken;

        var single = await client.GetWithTokenAsync($"{Root}/robots/{robotId}/activity", token);
        Assert.Equal(HttpStatusCode.Forbidden, single.StatusCode);
        Assert.Equal("robot_out_of_scope", await single.ReadErrorCodeAsync());

        var list = await (await client.GetWithTokenAsync($"{Root}/robots/activity", token)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Empty(list.GetProperty("items").EnumerateArray());
    }
}

internal static class JsonElementPathExtensions
{
    public static JsonElement GetProperty(this JsonElement element, string name, string parent) =>
        element.GetProperty(parent).GetProperty(name);
}

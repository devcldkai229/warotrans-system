using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.IntegrationTests.Transportation;

namespace WaroTrans.IntegrationTests.WorkflowExecution.Dispatch;

/// <summary>FL-01 reasons, FL-02 dispatch + override, FLT-01 decision log, HW-04 unknown battery.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class DispatchEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Jobs = "/api/workflow-execution/jobs";

    private async Task<(Guid JobId, TransportRequestScenario.Seed Seed)> QueuedJobAsync()
    {
        var seed = await TransportRequestScenario.SeedAsync(Factory.Services, Client, "CTN-" + Guid.NewGuid().ToString("N")[..8]);
        var workflowId = await TransportRequestScenario.CreatePublishedWorkflowAsync(Client);
        var requestId = await TransportRequestScenario.SubmitAsync(Client, seed, workflowId);
        var queued = await (await Client.PostAsync($"/api/transportation/transport-requests/{requestId}/queue", null))
            .Content.ReadFromJsonAsync<JsonElement>();
        return (queued.GetProperty("jobs")[0].GetProperty("jobId").GetGuid(), seed);
    }

    private async Task<Guid> SeedRobotAsync(TransportRequestScenario.Seed seed, decimal? battery)
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

    private static JsonElement CandidateOf(JsonElement candidates, Guid robotId) =>
        candidates.EnumerateArray().Single(c => c.GetProperty("robotId").GetGuid() == robotId);

    [Fact]
    public async Task Candidates_say_why_a_robot_is_not_eligible()
    {
        var (jobId, seed) = await QueuedJobAsync();
        var unknown = await SeedRobotAsync(seed, battery: null);
        var low = await SeedRobotAsync(seed, battery: 12m);

        var candidates = await Client.GetFromJsonAsync<JsonElement>($"{Jobs}/{jobId}/dispatch-candidates");

        var u = CandidateOf(candidates, unknown);
        Assert.False(u.GetProperty("eligible").GetBoolean());
        Assert.Equal("UNKNOWN", u.GetProperty("batteryState").GetString());
        Assert.Equal(JsonValueKind.Null, u.GetProperty("batteryPercent").ValueKind);
        Assert.True(u.GetProperty("overridable").GetBoolean());
        var l = CandidateOf(candidates, low);
        Assert.Equal("battery_low", l.GetProperty("reasons")[0].GetString());
        Assert.False(l.GetProperty("overridable").GetBoolean());

        var auto = await Client.PostAsJsonAsync($"{Jobs}/{jobId}/dispatch", new { });
        Assert.Equal("no_robot_available", await auto.ReadErrorCodeAsync());
        var decisions = await Client.GetFromJsonAsync<JsonElement>($"{Jobs}/{jobId}/dispatch-decisions");
        Assert.Equal("NONE", decisions[0].GetProperty("type").GetString());
    }

    [Fact]
    public async Task An_unknown_battery_needs_an_override_with_a_reason_and_the_decision_is_kept()
    {
        var (jobId, seed) = await QueuedJobAsync();
        var robotId = await SeedRobotAsync(seed, battery: null);

        var refused = await Client.PostAsJsonAsync($"{Jobs}/{jobId}/dispatch", new { robotId });
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("battery_unknown", await refused.ReadErrorCodeAsync());

        var overridden = await Client.PostAsJsonAsync($"{Jobs}/{jobId}/dispatch", new { robotId, overrideReason = "charged it this morning" });
        Assert.Equal(HttpStatusCode.OK, overridden.StatusCode);

        var decisions = await Client.GetFromJsonAsync<JsonElement>($"{Jobs}/{jobId}/dispatch-decisions");
        var decision = decisions[0];
        Assert.Equal("SELECTED", decision.GetProperty("type").GetString());
        Assert.Equal(robotId, decision.GetProperty("selectedRobotId").GetGuid());
        Assert.Equal("charged it this morning", decision.GetProperty("overrideReason").GetString());
        Assert.NotEmpty(decision.GetProperty("candidates").EnumerateArray());
    }

    [Fact]
    public async Task A_low_battery_cannot_be_overridden_and_staff_cannot_override_at_all()
    {
        var (jobId, seed) = await QueuedJobAsync();
        var low = await SeedRobotAsync(seed, battery: 12m);

        var overrideLow = await Client.PostAsJsonAsync($"{Jobs}/{jobId}/dispatch", new { robotId = low, overrideReason = "please" });
        Assert.Equal("battery_low", await overrideLow.ReadErrorCodeAsync());

        await Factory.CreateAccountAsync("sid", AccountRole.STAFF);
        var staffClient = CreateAnonymousClient();
        var staff = await staffClient.LoginAsync("sid");
        var staffOverride = await staffClient.SendWithTokenAsync(HttpMethod.Post, $"{Jobs}/{jobId}/dispatch", staff.AccessToken,
            new { robotId = low, overrideReason = "please" });
        Assert.Equal(HttpStatusCode.Forbidden, staffOverride.StatusCode);
    }

    [Fact]
    public async Task The_best_eligible_robot_is_dispatched_automatically()
    {
        var (jobId, seed) = await QueuedJobAsync();
        await SeedRobotAsync(seed, battery: null);
        var good = await SeedRobotAsync(seed, battery: 90m);

        var dispatched = await Client.PostAsJsonAsync($"{Jobs}/{jobId}/dispatch", new { });

        Assert.Equal(HttpStatusCode.OK, dispatched.StatusCode);
        Assert.Equal(good, (await dispatched.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("assignedRobotId").GetGuid());
    }
}

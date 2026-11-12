using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.IntegrationTests.Transportation;

namespace WaroTrans.IntegrationTests.WorkflowExecution.Dispatch;

/// <summary>FL-03 over the real API and database.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class RobotCapacityEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Jobs = "/api/workflow-execution/jobs";

    private async Task<Guid> SeedRobotAsync(TransportRequestScenario.Seed seed)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = Robot.Register(seed.WarehouseId, seed.MapVersionId, "RBT-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), "R", DateTimeOffset.UtcNow);
        robot.IsOnline = true;
        // The connectivity monitor (1 s tick, 2 s timeout in tests) turns an online robot without a heartbeat OFFLINE mid-test.
        robot.LastHeartbeatAt = DateTimeOffset.UtcNow.AddHours(1);
        robot.Status = RobotStatus.AVAILABLE;
        robot.LocalizationStatus = LocalizationStatus.LOCALIZED;
        robot.LastHeartbeatAt = DateTimeOffset.UtcNow;
        robot.LastTelemetryAt = DateTimeOffset.UtcNow;
        robot.BatteryPercent = 90m;
        robot.BatteryMeasuredAt = DateTimeOffset.UtcNow;
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot.Id;
    }

    private async Task<(TransportRequestScenario.Seed Seed, Guid RequestId)> RequestAsync()
    {
        var seed = await TransportRequestScenario.SeedAsync(Factory.Services, Client, "CTN-" + Guid.NewGuid().ToString("N")[..8]);
        var workflowId = await TransportRequestScenario.CreatePublishedWorkflowAsync(Client);
        return (seed, await TransportRequestScenario.SubmitAsync(Client, seed, workflowId));
    }

    private Task<HttpResponseMessage> SetCapacityAsync(Guid robot, object body) =>
        Client.PutAsJsonAsync($"/api/fleet/robots/{robot}/capacity", body);

    private Task<HttpResponseMessage> SetWeightAsync(Guid container, decimal kg) =>
        Client.PutAsJsonAsync($"/api/warehouse/containers/{container}/physical", new { weightKg = kg });

    [Fact]
    public async Task A_container_no_robot_can_carry_cannot_be_queued()
    {
        var (seed, requestId) = await RequestAsync();
        var robot = await SeedRobotAsync(seed);
        Assert.Equal(HttpStatusCode.OK, (await SetCapacityAsync(robot, new { maxPayloadKg = 10m })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SetWeightAsync(seed.ContainerId, 25m)).StatusCode);

        var refused = await Client.PostAsync($"/api/transportation/transport-requests/{requestId}/queue", null);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("no_robot_can_carry", await refused.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task A_robot_too_small_for_the_load_is_not_eligible_and_cannot_be_forced_while_a_bigger_one_can()
    {
        var (seed, requestId) = await RequestAsync();
        var small = await SeedRobotAsync(seed);
        var big = await SeedRobotAsync(seed);
        await SetCapacityAsync(small, new { maxPayloadKg = 10m });
        await SetCapacityAsync(big, new { maxPayloadKg = 50m });
        await SetWeightAsync(seed.ContainerId, 25m);
        var queued = await (await Client.PostAsync($"/api/transportation/transport-requests/{requestId}/queue", null)).Content.ReadFromJsonAsync<JsonElement>();
        var jobId = queued.GetProperty("jobs")[0].GetProperty("jobId").GetGuid();

        var candidates = await Client.GetFromJsonAsync<JsonElement>($"{Jobs}/{jobId}/dispatch-candidates");
        var smallRow = candidates.EnumerateArray().Single(c => c.GetProperty("robotId").GetGuid() == small);
        Assert.False(smallRow.GetProperty("eligible").GetBoolean());
        Assert.Contains("robot_payload_exceeded", smallRow.GetProperty("reasons").EnumerateArray().Select(r => r.GetString()));
        Assert.False(smallRow.GetProperty("overridable").GetBoolean());

        var forced = await Client.PostAsJsonAsync($"{Jobs}/{jobId}/dispatch", new { robotId = small, overrideReason = "please" });
        Assert.Equal("robot_payload_exceeded", await forced.ReadErrorCodeAsync());

        var dispatched = await Client.PostAsJsonAsync($"{Jobs}/{jobId}/dispatch", new { });
        Assert.Equal(big, (await dispatched.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("assignedRobotId").GetGuid());
    }

    [Fact]
    public async Task Missing_figures_do_not_refuse_but_the_decision_says_so()
    {
        var (seed, requestId) = await RequestAsync();
        var robot = await SeedRobotAsync(seed);
        var queued = await (await Client.PostAsync($"/api/transportation/transport-requests/{requestId}/queue", null)).Content.ReadFromJsonAsync<JsonElement>();
        var jobId = queued.GetProperty("jobs")[0].GetProperty("jobId").GetGuid();

        var candidates = await Client.GetFromJsonAsync<JsonElement>($"{Jobs}/{jobId}/dispatch-candidates");

        var row = candidates.EnumerateArray().Single(c => c.GetProperty("robotId").GetGuid() == robot);
        Assert.True(row.GetProperty("eligible").GetBoolean());
        Assert.Contains("capacity_unknown", row.GetProperty("notes").EnumerateArray().Select(n => n.GetString()));
    }

    [Fact]
    public async Task A_robot_larger_than_what_traffic_reserves_is_not_eligible()
    {
        var (seed, requestId) = await RequestAsync();
        var robot = await SeedRobotAsync(seed);
        await SetCapacityAsync(robot, new { lengthM = 2.0, widthM = 2.0 });
        var queued = await (await Client.PostAsync($"/api/transportation/transport-requests/{requestId}/queue", null)).Content.ReadFromJsonAsync<JsonElement>();
        var jobId = queued.GetProperty("jobs")[0].GetProperty("jobId").GetGuid();

        var candidates = await Client.GetFromJsonAsync<JsonElement>($"{Jobs}/{jobId}/dispatch-candidates");

        var row = candidates.EnumerateArray().Single(c => c.GetProperty("robotId").GetGuid() == robot);
        Assert.Contains("robot_larger_than_traffic_footprint", row.GetProperty("reasons").EnumerateArray().Select(r => r.GetString()));
    }

    [Fact]
    public async Task What_was_saved_is_read_back_on_the_robot_and_the_container()
    {
        var (seed, _) = await RequestAsync();
        var robot = await SeedRobotAsync(seed);

        await SetCapacityAsync(robot, new { maxPayloadKg = 30m, maxContainers = 2, lengthM = 0.3, widthM = 0.25 });
        await SetWeightAsync(seed.ContainerId, 12.5m);

        var read = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{robot}");
        Assert.Equal(30m, read.GetProperty("maxPayloadKg").GetDecimal());
        Assert.Equal(2, read.GetProperty("maxContainers").GetInt32());
        Assert.Equal(0.25, read.GetProperty("widthM").GetDouble());
        var physical = await Client.GetFromJsonAsync<JsonElement>($"/api/warehouse/containers/{seed.ContainerId}/physical");
        Assert.Equal(12.5m, physical.GetProperty("weightKg").GetDecimal());
    }

    [Fact]
    public async Task Values_below_zero_are_refused()
    {
        var (seed, _) = await RequestAsync();
        var robot = await SeedRobotAsync(seed);

        Assert.Equal("robot_capacity_invalid", await (await SetCapacityAsync(robot, new { maxPayloadKg = -1m })).ReadErrorCodeAsync());
        Assert.Equal("container_physical_invalid", await (await SetWeightAsync(seed.ContainerId, 0m)).ReadErrorCodeAsync());
    }
}

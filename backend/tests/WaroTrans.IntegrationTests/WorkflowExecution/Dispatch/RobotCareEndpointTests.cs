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

/// <summary>FL-08 / WH-06 through the real API: the samples publish, and robot Jobs are made with no request behind them.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class RobotCareEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Root = "/api/workflow-execution";

    private static string SamplePath(string code)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "samples", "workflows")))
        {
            dir = dir.Parent;
        }

        return Path.Combine(dir!.FullName, "samples", "workflows", code + ".request.json");
    }

    private async Task PublishAsync(string code)
    {
        var body = new StringContent(await File.ReadAllTextAsync(SamplePath(code)), System.Text.Encoding.UTF8, "application/json");
        var created = await Client.PostAsync($"{Root}/workflows", body);
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var published = await Client.PostAsync($"{Root}/workflows/{id}/publish", null);
        Assert.True(published.IsSuccessStatusCode, await published.Content.ReadAsStringAsync());
    }

    private async Task<Guid> SeedRobotAsync(TransportRequestScenario.Seed seed)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = Robot.Register(seed.WarehouseId, seed.MapVersionId, "RBT-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), "R", DateTimeOffset.UtcNow);
        robot.IsOnline = true;
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

    private Task<TransportRequestScenario.Seed> SeedAsync() =>
        TransportRequestScenario.SeedAsync(Factory.Services, Client, "CTN-" + Guid.NewGuid().ToString("N")[..8]);

    [Theory]
    [InlineData("OUTBOUND_RETRIEVAL")]
    [InlineData("POINT_TO_POINT_TRANSPORT")]
    [InlineData("ROBOT_RETURN_TO_PARK")]
    [InlineData("ROBOT_CHARGING")]
    [InlineData("MAINTENANCE_ALL_ROBOTS")]
    public async Task Each_sample_publishes_through_the_api(string code) => await PublishAsync(code);

    [Fact]
    public async Task Return_to_park_needs_the_workflow_published()
    {
        var seed = await SeedAsync();
        var robot = await SeedRobotAsync(seed);

        var refused = await Client.PostAsJsonAsync($"{Root}/robots/{robot}/return-to-park", new { endpointId = seed.DestinationEndpointId });

        Assert.Equal("workflow_not_published", await refused.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task A_park_job_has_no_request_behind_it_and_holds_the_robot_while_it_lasts()
    {
        var seed = await SeedAsync();
        var robot = await SeedRobotAsync(seed);
        await PublishAsync("ROBOT_RETURN_TO_PARK");

        var response = await Client.PostAsJsonAsync($"{Root}/robots/{robot}/return-to-park", new { endpointId = seed.DestinationEndpointId });

        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var job = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Empty(job.GetProperty("transportRequestIds").EnumerateArray());
        Assert.Equal(robot, job.GetProperty("assignedRobotId").GetGuid());
    }

    [Fact]
    public async Task A_maintenance_run_makes_a_job_per_robot_and_staff_cannot_start_one()
    {
        var seed = await SeedAsync();
        var a = await SeedRobotAsync(seed);
        var b = await SeedRobotAsync(seed);
        await PublishAsync("MAINTENANCE_ALL_ROBOTS");

        var run = await Client.PostAsJsonAsync($"{Root}/maintenance-runs", new { robotIds = new[] { a, b }, endpointId = seed.DestinationEndpointId });

        Assert.True(run.IsSuccessStatusCode, await run.Content.ReadAsStringAsync());
        Assert.Equal(2, (await run.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobIds").GetArrayLength());

        await Factory.CreateAccountAsync("care_staff", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync("care_staff")).AccessToken;
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.SendWithTokenAsync(HttpMethod.Post, $"{Root}/maintenance-runs", token, new { robotIds = new[] { a }, endpointId = seed.DestinationEndpointId })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.SendWithTokenAsync(HttpMethod.Post, $"{Root}/robots/{a}/return-to-park", token, new { })).StatusCode);
    }
}

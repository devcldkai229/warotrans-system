using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.IntegrationTests.Transportation;

namespace WaroTrans.IntegrationTests.Fleet.RobotControl;

/// <summary>Operator re-localize: the pose sent to the robot is the endpoint's, from the robot's own map.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class LocalizeRobotEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private CapturingMqttRobotCommandPublisher Mqtt => Factory.Services.GetRequiredService<CapturingMqttRobotCommandPublisher>();

    private async Task<(Guid Robot, TransportRequestScenario.Seed Seed)> SeedAsync(bool online = true, Action<Robot>? change = null)
    {
        var seed = await TransportRequestScenario.SeedAsync(Factory.Services, Client, "CTN-" + Guid.NewGuid().ToString("N")[..8]);
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = Robot.Register(seed.WarehouseId, seed.MapVersionId, "RBT-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), "R", DateTimeOffset.UtcNow);
        robot.IsOnline = online;
        // The connectivity monitor (1 s tick, 2 s timeout in tests) turns an online robot without a heartbeat OFFLINE mid-test.
        robot.LastHeartbeatAt = online ? DateTimeOffset.UtcNow.AddHours(1) : null;
        robot.Status = online ? RobotStatus.AVAILABLE : RobotStatus.OFFLINE;
        change?.Invoke(robot);
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return (robot.Id, seed);
    }

    [Fact]
    public async Task Localize_sends_the_endpoint_pose_of_the_robots_map()
    {
        var (robot, seed) = await SeedAsync();

        var response = await Client.PostAsJsonAsync($"/api/fleet/robots/{robot}/commands/localize", new { endpointId = seed.SourceEndpointId });

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var sent = Assert.Single(Mqtt.Published, m => m.Type == "LOCALIZE" && m.Payload.GetProperty("frameId").GetString() == "map"
                                                       && m.Payload.TryGetProperty("endpointCode", out _));
        Assert.True(sent.Payload.TryGetProperty("x", out _) && sent.Payload.TryGetProperty("yaw", out _));
    }

    [Fact]
    public async Task Localize_is_refused_offline_busy_or_on_another_map()
    {
        var (offline, seed) = await SeedAsync(online: false);
        var refused = await Client.PostAsJsonAsync($"/api/fleet/robots/{offline}/commands/localize", new { endpointId = seed.SourceEndpointId });
        Assert.Equal("robot_offline", await refused.ReadErrorCodeAsync());

        var (busy, busySeed) = await SeedAsync(change: r => r.CurrentCommandId = Guid.NewGuid());
        var running = await Client.PostAsJsonAsync($"/api/fleet/robots/{busy}/commands/localize", new { endpointId = busySeed.SourceEndpointId });
        Assert.Equal("robot_busy", await running.ReadErrorCodeAsync());

        var (robot, _) = await SeedAsync();
        var (_, otherMap) = await SeedAsync();
        var wrongMap = await Client.PostAsJsonAsync($"/api/fleet/robots/{robot}/commands/localize", new { endpointId = otherMap.SourceEndpointId });
        Assert.Equal("endpoint_not_on_robot_map", await wrongMap.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Staff_may_not_localize()
    {
        var (robot, seed) = await SeedAsync();
        await Factory.CreateAccountAsync("loc_staff", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync("loc_staff")).AccessToken;

        var response = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{robot}/commands/localize", token, new { endpointId = seed.SourceEndpointId });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}

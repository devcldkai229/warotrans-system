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

namespace WaroTrans.IntegrationTests.Fleet.RobotControl;

/// <summary>RB-03 stop / resume, RB-04 manual lease, RB-08 maintenance, RB-09 system actions — through real tokens.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class RobotControlEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private async Task<Guid> SeedRobotAsync(bool online = true, Action<Robot>? change = null)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), "R", DateTimeOffset.UtcNow);
        robot.IsOnline = online;
        // The connectivity monitor (1 s tick, 2 s timeout in tests) turns an online robot without a heartbeat OFFLINE mid-test.
        robot.LastHeartbeatAt = online ? DateTimeOffset.UtcNow.AddHours(1) : null;
        robot.Status = online ? RobotStatus.AVAILABLE : RobotStatus.OFFLINE;
        change?.Invoke(robot);
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot.Id;
    }

    private async Task<(HttpClient Client, SessionDto Session)> SignInAsync(string username, AccountRole role)
    {
        await Factory.CreateAccountAsync(username, role);
        var client = CreateAnonymousClient();
        return (client, await client.LoginAsync(username));
    }

    private static async Task<JsonElement> BodyAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();

    private CapturingMqttRobotCommandPublisher Mqtt => Factory.Services.GetRequiredService<CapturingMqttRobotCommandPublisher>();

    [Fact]
    public async Task Staff_can_stop_a_robot_but_not_resume_it()
    {
        var robotId = await SeedRobotAsync();
        var (client, staff) = await SignInAsync("sam", AccountRole.STAFF);

        var stop = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{robotId}/commands/stop", staff.AccessToken,
            new { mode = "STOP", reason = "person in aisle" });

        Assert.Equal(HttpStatusCode.Accepted, stop.StatusCode);
        Assert.Equal("REQUESTED", (await BodyAsync(stop)).GetProperty("state").GetString());
        Assert.Contains(Mqtt.Published, m => m.Type == "STOP" && m.Payload.GetProperty("reason").GetString() == "person in aisle");

        var resume = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{robotId}/commands/resume", staff.AccessToken);
        Assert.Equal(HttpStatusCode.Forbidden, resume.StatusCode);
    }

    [Fact]
    public async Task Stopping_an_offline_robot_says_so_instead_of_pretending()
    {
        var robotId = await SeedRobotAsync(online: false);

        var stop = await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/commands/stop", new { });

        Assert.Equal(HttpStatusCode.Conflict, stop.StatusCode);
        Assert.Equal("robot_offline", await stop.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task A_held_robot_takes_no_navigation_goal()
    {
        var robotId = await SeedRobotAsync(change: r => r.MotionHeld = true);

        var navigate = await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/commands/navigate", new { x = 1.0, y = 1.0, yaw = 0.0 });

        Assert.Equal(HttpStatusCode.Conflict, navigate.StatusCode);
        Assert.Equal("robot_motion_held", await navigate.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Only_one_person_drives_and_an_admin_takeover_needs_a_reason()
    {
        var robotId = await SeedRobotAsync();
        var tech = await Factory.CreateAccountAsync("tina", AccountRole.TECHNICIAN);
        await Factory.CreateAccountAsync("boss", AccountRole.ADMIN);
        var client = CreateAnonymousClient();
        var admin = await client.LoginAsync("boss");
        await client.SendWithTokenAsync(HttpMethod.Put, $"/api/identity/accounts/{tech.Id}/robot-scope", admin.AccessToken, new { robotIds = new[] { robotId } });
        var tina = await client.LoginAsync("tina");

        var lease = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{robotId}/manual/lease", tina.AccessToken, new { });
        Assert.Equal(HttpStatusCode.OK, lease.StatusCode);
        Assert.True((await BodyAsync(lease)).GetProperty("heldByMe").GetBoolean());

        var adminTry = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{robotId}/manual/lease", admin.AccessToken, new { });
        Assert.Equal("manual_lease_held", await adminTry.ReadErrorCodeAsync());
        var adminDrives = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{robotId}/teleop", admin.AccessToken, new { linear = 0.1, angular = 0.0 });
        Assert.Equal("manual_lease_required", await adminDrives.ReadErrorCodeAsync());

        var tinaDrives = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{robotId}/teleop", tina.AccessToken, new { linear = 0.1, angular = 0.0 });
        Assert.Equal(HttpStatusCode.Accepted, tinaDrives.StatusCode);

        var silentTakeover = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{robotId}/manual/lease", admin.AccessToken, new { takeover = true });
        Assert.Equal(HttpStatusCode.Forbidden, silentTakeover.StatusCode);
        var takeover = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{robotId}/manual/lease", admin.AccessToken,
            new { takeover = true, reason = "tina left the site" });
        Assert.Equal(HttpStatusCode.OK, takeover.StatusCode);

        var tinaAfter = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{robotId}/teleop", tina.AccessToken, new { linear = 0.1, angular = 0.0 });
        Assert.Equal("manual_lease_required", await tinaAfter.ReadErrorCodeAsync());
        // A stop always goes through, lease or not.
        var tinaStops = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{robotId}/teleop", tina.AccessToken, new { linear = 0.0, angular = 0.0 });
        Assert.Equal(HttpStatusCode.Accepted, tinaStops.StatusCode);
    }

    [Fact]
    public async Task Maintenance_returns_the_robot_only_after_a_full_checklist()
    {
        var robotId = await SeedRobotAsync();

        var start = await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/maintenance/start", new { reason = "wheel noise" });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        Assert.Equal("MAINTENANCE", (await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{robotId}")).GetProperty("status").GetString());

        var navigate = await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/commands/navigate", new { x = 1.0, y = 1.0, yaw = 0.0 });
        Assert.Equal("robot_in_maintenance", await navigate.ReadErrorCodeAsync());

        var partial = await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/maintenance/complete",
            new { sensorsOk = true, localizationOk = true, stopTestOk = false, trafficClear = true });
        Assert.Equal(HttpStatusCode.BadRequest, partial.StatusCode);
        Assert.Equal("maintenance_checklist_failed", await partial.ReadErrorCodeAsync());

        var done = await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/maintenance/complete",
            new { sensorsOk = true, localizationOk = true, stopTestOk = true, trafficClear = true, notes = "bearing replaced" });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        Assert.Equal("AVAILABLE", (await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{robotId}")).GetProperty("status").GetString());

        var history = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{robotId}/maintenance");
        var record = Assert.Single(history.EnumerateArray());
        Assert.Equal("wheel noise", record.GetProperty("reason").GetString());
        Assert.Equal("bearing replaced", record.GetProperty("notes").GetString());
    }

    [Fact]
    public async Task System_actions_need_the_capability_a_stopped_robot_and_the_typed_code()
    {
        var plain = await SeedRobotAsync();
        var capable = await SeedRobotAsync(change: r => r.Capabilities = "RESTART_STACK");
        var held = await SeedRobotAsync(change: r => { r.Capabilities = "RESTART_STACK"; r.MotionHeld = true; });
        string CodeOf(Guid id)
        {
            using var scope = Factory.Services.CreateScope();
            return scope.ServiceProvider.GetRequiredService<FleetDbContext>().Robots.Single(r => r.Id == id).Code;
        }

        var unsupported = await Client.PostAsJsonAsync($"/api/fleet/robots/{plain}/system-actions", new { action = "RESTART_STACK", confirmRobotCode = CodeOf(plain) });
        Assert.Equal("robot_capability_unsupported", await unsupported.ReadErrorCodeAsync());

        var moving = await Client.PostAsJsonAsync($"/api/fleet/robots/{capable}/system-actions", new { action = "RESTART_STACK", confirmRobotCode = CodeOf(capable) });
        Assert.Equal("robot_not_stopped", await moving.ReadErrorCodeAsync());

        var wrongCode = await Client.PostAsJsonAsync($"/api/fleet/robots/{held}/system-actions", new { action = "RESTART_STACK", confirmRobotCode = "RBT-NOPE" });
        Assert.Equal("system_action_not_confirmed", await wrongCode.ReadErrorCodeAsync());

        var ok = await Client.PostAsJsonAsync($"/api/fleet/robots/{held}/system-actions", new { action = "RESTART_STACK", confirmRobotCode = CodeOf(held) });
        Assert.Equal(HttpStatusCode.Accepted, ok.StatusCode);
        Assert.Contains(Mqtt.Published, m => m.Type == "SYSTEM_ACTION" && m.Payload.GetProperty("action").GetString() == "RESTART_STACK");
    }
}

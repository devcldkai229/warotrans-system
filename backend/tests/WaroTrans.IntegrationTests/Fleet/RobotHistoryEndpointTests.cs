using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.IntegrationTests.Transportation;
using Microsoft.EntityFrameworkCore;

namespace WaroTrans.IntegrationTests.Fleet;

/// <summary>BOTH-02 history from real writes; FLT-02 catalog.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class RobotHistoryEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private async Task<Guid> SeedRobotAsync()
    {
        var seed = await TransportRequestScenario.SeedAsync(Factory.Services, Client, "CTN-" + Guid.NewGuid().ToString("N")[..8]);
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = WaroTrans.Fleet.Entities.Robot.Register(seed.WarehouseId, seed.MapVersionId, "RBT-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), "R", DateTimeOffset.UtcNow);
        robot.IsOnline = true;
        robot.Status = RobotStatus.AVAILABLE;
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot.Id;
    }

    private async Task<WaroTrans.Fleet.Entities.Robot> ChangeAsync(Guid id, Action<WaroTrans.Fleet.Entities.Robot> change)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = await db.Robots.SingleAsync(r => r.Id == id);
        change(robot);
        await db.SaveChangesAsync();
        return robot;
    }

    [Fact]
    public async Task Only_changes_of_state_are_written_and_they_page_newest_first()
    {
        var id = await SeedRobotAsync();

        // A telemetry-like change is not history.
        await ChangeAsync(id, r => r.PoseX = 3.5);
        var quiet = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{id}/state-history");
        Assert.Equal(0, quiet.GetProperty("total").GetInt32());

        await ChangeAsync(id, r => r.IsOnline = false);
        await ChangeAsync(id, r => r.IsOnline = true);
        await ChangeAsync(id, r => r.MotionHeld = true);

        var all = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{id}/state-history");
        Assert.Equal(3, all.GetProperty("total").GetInt32());
        Assert.Equal("motion_held", all.GetProperty("items")[0].GetProperty("reason").GetString());
        Assert.Equal("offline", all.GetProperty("items")[2].GetProperty("reason").GetString());

        var page = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{id}/state-history?skip=1&take=1");
        Assert.Equal("online", Assert.Single(page.GetProperty("items").EnumerateArray()).GetProperty("reason").GetString());

        var future = DateTimeOffset.UtcNow.AddMinutes(5).ToString("O").Replace("+", "%2B");
        var none = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{id}/state-history?from={future}");
        Assert.Equal(0, none.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task A_command_appears_in_the_history_with_its_status()
    {
        var id = await SeedRobotAsync();
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            db.RobotCommands.Add(WaroTrans.Fleet.Entities.RobotCommand.CreateNavigate(id, Guid.NewGuid(), "{}", DateTimeOffset.UtcNow, null, null));
            await db.SaveChangesAsync();
        }

        var history = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{id}/state-history");

        var item = Assert.Single(history.GetProperty("items").EnumerateArray());
        Assert.Equal("COMMAND", item.GetProperty("kind").GetString());
        Assert.Equal("NAVIGATE_TO_POSE", item.GetProperty("commandType").GetString());
    }

    [Fact]
    public async Task The_catalog_offers_nothing_the_robot_cannot_do()
    {
        var id = await SeedRobotAsync();

        var online = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{id}/commands/catalog");
        var items = online.GetProperty("items").EnumerateArray().ToDictionary(i => i.GetProperty("code").GetString()!);
        Assert.True(items["STOP"].GetProperty("supported").GetBoolean());
        Assert.Equal("ACK_AND_RESULT", items["STOP"].GetProperty("acknowledgement").GetString());
        Assert.Equal("robot.stop", items["STOP"].GetProperty("permission").GetString());
        Assert.False(items["REBOOT"].GetProperty("supported").GetBoolean());
        foreach (var code in new[] { "LOCALIZE", "DOCK", "CHARGE" })
        {
            Assert.False(items[code].GetProperty("supported").GetBoolean());
            Assert.False(string.IsNullOrEmpty(items[code].GetProperty("reason").GetString()));
        }

        await ChangeAsync(id, r => { r.Capabilities = "REBOOT"; r.IsOnline = true; });
        var announced = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{id}/commands/catalog");
        Assert.True(announced.GetProperty("items").EnumerateArray().Single(i => i.GetProperty("code").GetString() == "REBOOT").GetProperty("supported").GetBoolean());

        await ChangeAsync(id, r => r.IsOnline = false);
        var offline = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{id}/commands/catalog");
        var stop = offline.GetProperty("items").EnumerateArray().Single(i => i.GetProperty("code").GetString() == "STOP");
        Assert.False(stop.GetProperty("supported").GetBoolean());
        Assert.Equal("robot_offline", stop.GetProperty("reason").GetString());
    }
}

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
    public async Task The_history_can_be_filtered_by_kind_and_by_source_and_a_typo_is_refused()
    {
        var id = await SeedRobotAsync();
        await ChangeAsync(id, r => r.IsOnline = false); // a SYSTEM state change
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            db.RobotCommands.Add(WaroTrans.Fleet.Entities.RobotCommand.CreateNavigate(id, Guid.NewGuid(), "{}", DateTimeOffset.UtcNow, null, null));
            db.RobotStateEvents.Add(new WaroTrans.Fleet.Entities.RobotStateEvent
            {
                Id = Guid.NewGuid(),
                RobotId = id,
                FromStatus = RobotStatus.AVAILABLE,
                ToStatus = RobotStatus.AVAILABLE,
                Reason = "motion_released",
                Source = RobotStateEventSource.OPERATOR,
                OccurredAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }

        async Task<JsonElement> Get(string query) =>
            await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{id}/state-history{query}");

        Assert.Equal(3, (await Get("")).GetProperty("total").GetInt32());

        var states = await Get("?kind=STATE");
        Assert.Equal(2, states.GetProperty("total").GetInt32());
        Assert.All(states.GetProperty("items").EnumerateArray(), i => Assert.Equal("STATE", i.GetProperty("kind").GetString()));

        var commands = await Get("?kind=command");
        Assert.Equal(1, commands.GetProperty("total").GetInt32());
        Assert.Equal("COMMAND", Assert.Single(commands.GetProperty("items").EnumerateArray()).GetProperty("kind").GetString());

        var operator_ = await Get("?source=operator");
        Assert.Equal(1, operator_.GetProperty("total").GetInt32());
        Assert.Equal("OPERATOR", Assert.Single(operator_.GetProperty("items").EnumerateArray()).GetProperty("source").GetString());

        // A command has no source, so asking for commands from a source matches nothing.
        Assert.Equal(0, (await Get("?kind=COMMAND&source=SYSTEM")).GetProperty("total").GetInt32());
        // The filters count and page together.
        var paged = await Get("?kind=STATE&skip=1&take=1");
        Assert.Equal(2, paged.GetProperty("total").GetInt32());
        Assert.Single(paged.GetProperty("items").EnumerateArray());

        foreach (var (query, code) in new[] { ("?kind=ROBOT", "robot_history_kind_invalid"), ("?source=bogus", "robot_history_source_invalid"), ("?source=1", "robot_history_source_invalid") })
        {
            var refused = await Client.GetAsync($"/api/fleet/robots/{id}/state-history{query}");
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Equal(code, (await refused.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        }
    }

    [Fact]
    public async Task A_state_line_keeps_the_battery_and_error_of_that_moment_and_never_a_battery_nobody_measured()
    {
        var measured = await SeedRobotAsync();
        await ChangeAsync(measured, r =>
        {
            r.BatteryPercent = 18.04m;
            r.BatteryMeasuredAt = DateTimeOffset.UtcNow;
            r.ErrorCode = "LIDAR_TIMEOUT";
            r.Status = RobotStatus.ERROR;
        });

        var line = (await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{measured}/state-history")).GetProperty("items")[0];
        var details = line.GetProperty("details");
        // The robot's own values as it was saved, not what the database held a moment before.
        Assert.Equal("ERROR", line.GetProperty("toStatus").GetString());
        Assert.Equal(18.0m, details.GetProperty("batteryPercent").GetDecimal());
        Assert.Equal("LIDAR_TIMEOUT", details.GetProperty("errorCode").GetString());

        // A robot that never reported a battery has no percentage, which is not 0 %.
        var unmeasured = await SeedRobotAsync();
        await ChangeAsync(unmeasured, r => r.IsOnline = false);
        var quiet = (await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{unmeasured}/state-history")).GetProperty("items")[0].GetProperty("details");
        Assert.Equal(JsonValueKind.Null, quiet.GetProperty("batteryPercent").ValueKind);
        Assert.Equal(JsonValueKind.Null, quiet.GetProperty("errorCode").ValueKind);

        // A line written before details were kept has none, and a command never has.
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            db.RobotStateEvents.Add(new WaroTrans.Fleet.Entities.RobotStateEvent
            {
                Id = Guid.NewGuid(), RobotId = unmeasured, ToStatus = RobotStatus.OFFLINE, Reason = "offline",
                Source = RobotStateEventSource.SYSTEM, OccurredAt = DateTimeOffset.UtcNow.AddMinutes(-1)
            });
            db.RobotCommands.Add(WaroTrans.Fleet.Entities.RobotCommand.CreateNavigate(unmeasured, Guid.NewGuid(), "{}", DateTimeOffset.UtcNow.AddMinutes(-2), null, null));
            await db.SaveChangesAsync();
        }

        var items = (await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{unmeasured}/state-history")).GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(JsonValueKind.Null, items.Single(i => i.GetProperty("reason").GetString() == "offline" && i.GetProperty("details").ValueKind == JsonValueKind.Null).GetProperty("details").ValueKind);
        Assert.Equal(JsonValueKind.Null, items.Single(i => i.GetProperty("kind").GetString() == "COMMAND").GetProperty("details").ValueKind);
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

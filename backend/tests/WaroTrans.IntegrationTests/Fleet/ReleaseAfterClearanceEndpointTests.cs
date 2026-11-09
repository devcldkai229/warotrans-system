using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.IntegrationTests.Transportation;

namespace WaroTrans.IntegrationTests.Fleet;

/// <summary>WEB-FLEET-06: a click cannot free a zone; what software can check, it checks. Enforced when the API is called directly.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class ReleaseAfterClearanceEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private async Task<(Guid Id, string Code)> SeedRobotAsync(bool online, LocalizationStatus? localization)
    {
        var seed = await TransportRequestScenario.SeedAsync(Factory.Services, Client, "CTN-" + Guid.NewGuid().ToString("N")[..8]);
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var code = "RBT-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        var robot = Robot.Register(seed.WarehouseId, seed.MapVersionId, code, "R", DateTimeOffset.UtcNow);
        robot.IsOnline = online;
        robot.Status = RobotStatus.AVAILABLE;
        robot.LocalizationStatus = localization ?? LocalizationStatus.LOST;
        robot.LastTelemetryAt = DateTimeOffset.UtcNow;
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return (robot.Id, code);
    }

    private Task<HttpResponseMessage> ReleaseAsync(Guid id, object body) =>
        Client.PostAsJsonAsync($"/api/fleet/traffic/robots/{id}/release-after-clearance", body);

    [Fact]
    public async Task It_takes_a_confirmation_a_reason_and_the_robot_code()
    {
        var (id, code) = await SeedRobotAsync(online: false, null);

        Assert.Equal("clearance_not_confirmed", await (await ReleaseAsync(id, new { robotCode = code, clearanceConfirmed = false, reason = "checked" })).ReadErrorCodeAsync());
        Assert.Equal("clearance_reason_required", await (await ReleaseAsync(id, new { robotCode = code, clearanceConfirmed = true, reason = " " })).ReadErrorCodeAsync());
        Assert.Equal("robot_code_mismatch", await (await ReleaseAsync(id, new { robotCode = "RBT-OTHER", clearanceConfirmed = true, reason = "checked" })).ReadErrorCodeAsync());
    }

    [Fact]
    public async Task A_robot_that_can_report_its_pose_must_be_reconciled_instead()
    {
        var (id, code) = await SeedRobotAsync(online: true, LocalizationStatus.LOCALIZED);

        var refused = await ReleaseAsync(id, new { robotCode = code, clearanceConfirmed = true, reason = "checked" });

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("robot_can_report_pose", await refused.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task A_robot_holding_nothing_has_nothing_to_release()
    {
        var (id, code) = await SeedRobotAsync(online: false, null);

        var refused = await ReleaseAsync(id, new { robotCode = code, clearanceConfirmed = true, reason = "checked" });

        Assert.Equal("nothing_to_release", await refused.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task A_robot_with_a_navigation_running_is_refused()
    {
        var (id, code) = await SeedRobotAsync(online: false, null);
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            db.RobotCommands.Add(WaroTrans.Fleet.Entities.RobotCommand.CreateNavigate(id, Guid.NewGuid(), "{}", DateTimeOffset.UtcNow, null, null));
            await db.SaveChangesAsync();
        }

        var refused = await ReleaseAsync(id, new { robotCode = code, clearanceConfirmed = true, reason = "checked" });

        Assert.Equal("robot_has_active_command", await refused.ReadErrorCodeAsync());
    }
}

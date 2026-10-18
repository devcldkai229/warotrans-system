using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.ProcessRobotCommandAck;
using WaroTrans.Fleet.Features.ProcessRobotCommandResult;
using WaroTrans.Fleet.Features.ProcessRobotHeartbeat;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Fleet.RobotCommand;

[Collection(IntegrationCollection.Name)]
public sealed class RobotCommandMqttIntegrationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    [Fact]
    public async Task Navigate_ack_result_updates_robot_and_command()
    {
        var robot = await RegisterAsync("Cmd Bot");
        var boot = Guid.NewGuid();
        long seq = 0;
        await ForceOnlineAsync(robot.Code, boot, () => ++seq);

        var issue = await Client.PostAsJsonAsync(
            $"/api/fleet/robots/{robot.Id}/commands/navigate",
            new { x = 1.5, y = 2.5, yaw = 0.3, frameId = "map" });
        issue.EnsureSuccessStatusCode();
        var issued = (await issue.Content.ReadFromJsonAsync<IssueDto>(JsonOptions))!;

        var reserved = await GetRobotAsync(robot.Id);
        Assert.Equal(RobotStatus.RESERVED, reserved.Status);
        Assert.Equal(issued.CommandId, reserved.CurrentCommandId);

        await ApplyAckAsync(robot.Code, issued.CommandId, accepted: true);
        var executing = await GetRobotAsync(robot.Id);
        Assert.Equal(RobotStatus.EXECUTING, executing.Status);
        Assert.Equal(issued.CommandId, executing.CurrentCommandId);

        // In-process command_result (Develop/Main CI has no Mosquitto service).
        await ApplyResultAsync(robot.Code, issued.CommandId, "SUCCEEDED");
        var done = await WaitForRobotAsync(
            robot.Id,
            r => r.Status == RobotStatus.AVAILABLE && r.CurrentCommandId == null,
            () => ForceOnlineAsync(robot.Code, boot, () => ++seq));
        Assert.Equal(RobotStatus.AVAILABLE, done.Status);
    }

    [Fact]
    public async Task Navigate_reject_ack_returns_available()
    {
        var robot = await RegisterAsync("Reject Bot");
        var boot = Guid.NewGuid();
        long seq = 0;
        await ForceOnlineAsync(robot.Code, boot, () => ++seq);

        var issue = await Client.PostAsJsonAsync(
            $"/api/fleet/robots/{robot.Id}/commands/navigate",
            new { x = 0.0, y = 0.0, yaw = 0.0 });
        issue.EnsureSuccessStatusCode();
        var issued = (await issue.Content.ReadFromJsonAsync<IssueDto>(JsonOptions))!;

        await ApplyAckAsync(robot.Code, issued.CommandId, accepted: false, reason: "NOT_LOCALIZED");

        var after = await WaitForRobotAsync(
            robot.Id,
            r => r.Status == RobotStatus.AVAILABLE && r.CurrentCommandId == null,
            () => ForceOnlineAsync(robot.Code, boot, () => ++seq));
        Assert.Equal(RobotStatus.AVAILABLE, after.Status);
    }

    [Fact]
    public async Task Teleop_publishes_setpoint_on_teleop_topic_for_free_robot()
    {
        var robot = await RegisterAsync("Teleop Bot");
        long seq = 0;
        await ForceOnlineAsync(robot.Code, Guid.NewGuid(), () => ++seq);
        var mqtt = Factory.Services.GetRequiredService<CapturingMqttRobotCommandPublisher>();

        var response = await Client.PostAsJsonAsync(
            $"/api/fleet/robots/{robot.Id}/teleop",
            new { linear = 0.2, angular = -0.4 });

        Assert.Equal(System.Net.HttpStatusCode.Accepted, response.StatusCode);
        var sent = Assert.Single(mqtt.PublishedTeleop, m => m.RobotCode == robot.Code);
        Assert.Equal(0.2, sent.Linear);
        Assert.Equal(-0.4, sent.Angular);
        Assert.DoesNotContain(mqtt.Published, m => m.RobotCode == robot.Code); // not a robot command
    }

    [Fact]
    public async Task Teleop_refused_while_navigating_but_stop_goes_through()
    {
        var robot = await RegisterAsync("Teleop Busy Bot");
        long seq = 0;
        await ForceOnlineAsync(robot.Code, Guid.NewGuid(), () => ++seq);
        (await Client.PostAsJsonAsync(
            $"/api/fleet/robots/{robot.Id}/commands/navigate",
            new { x = 1.0, y = 1.0, yaw = 0.0 })).EnsureSuccessStatusCode();
        var mqtt = Factory.Services.GetRequiredService<CapturingMqttRobotCommandPublisher>();

        var drive = await Client.PostAsJsonAsync($"/api/fleet/robots/{robot.Id}/teleop", new { linear = 0.2, angular = 0.0 });
        Assert.False(drive.IsSuccessStatusCode);
        Assert.Contains("robot_busy", await drive.Content.ReadAsStringAsync());

        var stop = await Client.PostAsJsonAsync($"/api/fleet/robots/{robot.Id}/teleop", new { linear = 0.0, angular = 0.0 });
        Assert.Equal(System.Net.HttpStatusCode.Accepted, stop.StatusCode);
        var sent = Assert.Single(mqtt.PublishedTeleop, m => m.RobotCode == robot.Code);
        Assert.Equal(0.0, sent.Linear);
    }

    private async Task ForceOnlineAsync(string robotCode, Guid bootId, Func<long> nextSeq)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var handler = scope.ServiceProvider.GetRequiredService<ProcessRobotHeartbeatHandler>();
        await handler.HandleAsync(
            new RobotHeartbeatMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                RobotCode = robotCode,
                BootId = bootId,
                Sequence = nextSeq(),
                SentAt = DateTimeOffset.UtcNow
            },
            CancellationToken.None);
    }

    private async Task ApplyAckAsync(string robotCode, Guid commandId, bool accepted, string? reason = null)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var handler = scope.ServiceProvider.GetRequiredService<ProcessRobotCommandAckHandler>();
        await handler.HandleAsync(
            new RobotCommandAckMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                CommandId = commandId,
                RobotCode = robotCode,
                Accepted = accepted,
                ReasonCode = reason,
                SentAt = DateTimeOffset.UtcNow
            },
            CancellationToken.None);
    }

    private async Task ApplyResultAsync(string robotCode, Guid commandId, string outcome, string? errorCode = null)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var handler = scope.ServiceProvider.GetRequiredService<ProcessRobotCommandResultHandler>();
        await handler.HandleAsync(
            new RobotCommandResultMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                CommandId = commandId,
                RobotCode = robotCode,
                Outcome = outcome,
                ErrorCode = errorCode,
                SentAt = DateTimeOffset.UtcNow
            },
            CancellationToken.None);
    }

    private async Task<RobotDto> RegisterAsync(string name)
    {
        var warehouseId = Guid.NewGuid();
        var suffix = warehouseId.ToString("N")[..8].ToUpperInvariant();
        var now = DateTimeOffset.UtcNow;

        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
            db.Warehouses.Add(new WaroTrans.Warehouse.Entities.Warehouse
            {
                Id = warehouseId,
                Code = $"WH-{suffix}",
                Name = $"Warehouse {suffix}",
                Timezone = "Asia/Ho_Chi_Minh",
                IsActive = true,
                CreatedAt = now
            });
            await db.SaveChangesAsync();
        }

        var mapResponse = await Client.PostAsJsonAsync(
            $"/api/navigation/warehouses/{warehouseId}/maps",
            new
            {
                name = "Map",
                mapUri = "http://storage/map.yaml",
                resolution = 0.05,
                originX = 0,
                originY = 0,
                originYaw = 0
            });
        mapResponse.EnsureSuccessStatusCode();
        var mapId = (await mapResponse.Content.ReadFromJsonAsync<IdDto>(JsonOptions))!.Id;
        (await Client.PostAsync($"/api/navigation/maps/{mapId}/publish", null)).EnsureSuccessStatusCode();

        var code = $"RBT-{suffix}";
        var response = await Client.PostAsJsonAsync("/api/fleet/robots", new
        {
            warehouseId,
            currentMapVersionId = mapId,
            code,
            name
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RobotDto>(JsonOptions))!;
    }

    private sealed record IdDto(Guid Id);

    private async Task<RobotDto> GetRobotAsync(Guid id)
    {
        var response = await Client.GetAsync($"/api/fleet/robots/{id}");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RobotDto>(JsonOptions))!;
    }

    private async Task<RobotDto> WaitForRobotAsync(
        Guid id,
        Func<RobotDto, bool> predicate,
        Func<Task>? keepAlive = null,
        TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(20));
        RobotDto? last = null;
        while (DateTime.UtcNow < deadline)
        {
            if (keepAlive is not null)
            {
                await keepAlive();
            }

            last = await GetRobotAsync(id);
            if (predicate(last))
            {
                return last;
            }

            await Task.Delay(200);
        }

        throw new TimeoutException($"Robot {id} did not reach expected state. Last={JsonSerializer.Serialize(last)}");
    }

    private sealed record IssueDto(Guid CommandId, Guid RobotId, string RobotCode, RobotCommandStatus Status);

    private sealed record RobotDto(
        Guid Id,
        string Code,
        RobotStatus Status,
        bool IsOnline,
        Guid? CurrentCommandId);
}

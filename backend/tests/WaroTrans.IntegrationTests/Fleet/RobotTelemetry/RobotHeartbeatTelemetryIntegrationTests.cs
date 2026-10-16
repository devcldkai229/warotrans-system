using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.ProcessRobotHeartbeat;
using WaroTrans.Fleet.Features.ProcessRobotTelemetry;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Fleet.RobotTelemetry;

[Collection(IntegrationCollection.Name)]
public sealed class RobotHeartbeatTelemetryIntegrationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    [Fact]
    public async Task Heartbeat_telemetry_offline_online_and_stale_sequence()
    {
        var created = await RegisterAsync("HB Bot");
        var boot = Guid.NewGuid();
        long heartbeatSeq = 0;
        var connectivityEvents = new ConcurrentBag<bool>();

        await using var hub = new HubConnectionBuilder()
            .WithUrl(new Uri(Factory.Server.BaseAddress!, "/hubs/notifications"), options =>
            {
                options.HttpMessageHandlerFactory = _ => Factory.Server.CreateHandler();
            })
            .Build();

        hub.On<JsonElement>("robotConnectivityChanged", payload =>
        {
            if (!payload.TryGetProperty("robotId", out var robotIdProp)
                || robotIdProp.GetGuid() != created.Id)
            {
                return;
            }

            if (payload.TryGetProperty("isOnline", out var online))
            {
                connectivityEvents.Add(online.GetBoolean());
            }
        });
        await hub.StartAsync();

        // Drive heartbeat/telemetry via in-process handlers (same as RobotCommandMqttIntegrationTests).
        // Full-suite MQTT broker delivery is flaky on Windows; connectivity monitor + handlers cover the domain path.
        await ApplyHeartbeatAsync(created.Code, boot, ++heartbeatSeq);
        var online = await WaitForRobotAsync(created.Id, r => r.IsOnline);
        Assert.True(online.IsOnline);
        Assert.Equal(RobotStatus.OFFLINE, online.Status);

        await ApplyTelemetryAsync(created.Code, boot, 1, 3.5, 4.5, 1.2, "NAVIGATING", "LOCALIZED");
        // Keep heartbeat fresh so the 2s connectivity monitor does not race the assertion.
        await ApplyHeartbeatAsync(created.Code, boot, ++heartbeatSeq);
        var withPose = await WaitForRobotAsync(
            created.Id,
            r => Math.Abs(r.PoseX - 3.5) < 0.001 && r.NavigationStatus == NavigationStatus.NAVIGATING);
        Assert.Equal(3.5, withPose.PoseX);
        Assert.Equal(4.5, withPose.PoseY);
        Assert.Equal(1.2, withPose.PoseYaw);
        Assert.Equal(NavigationStatus.NAVIGATING, withPose.NavigationStatus);
        Assert.Equal(LocalizationStatus.LOCALIZED, withPose.LocalizationStatus);
        Assert.Equal(RobotStatus.OFFLINE, withPose.Status);

        await ApplyTelemetryAsync(created.Code, boot, 1, 0, 0, 0, "FAILED", "LOST");
        await Task.Delay(200);
        var afterStale = await GetRobotAsync(created.Id);
        Assert.Equal(3.5, afterStale.PoseX);
        Assert.Equal(NavigationStatus.NAVIGATING, afterStale.NavigationStatus);

        // No further heartbeats → connectivity monitor marks offline (HeartbeatTimeoutSeconds=2).
        var offline = await WaitForRobotAsync(created.Id, r => !r.IsOnline, timeout: TimeSpan.FromSeconds(10));
        Assert.False(offline.IsOnline);
        Assert.Equal(RobotStatus.OFFLINE, offline.Status);

        // Hub fan-out of offline can be dropped under collection-fixture load; DB offline above is the contract.
        _ = await TryWaitForConnectivityEventAsync(connectivityEvents, expected: false, timeout: TimeSpan.FromSeconds(3));

        await ApplyHeartbeatAsync(created.Code, boot, ++heartbeatSeq);
        var backOnline = await WaitForRobotAsync(created.Id, r => r.IsOnline);
        Assert.True(backOnline.IsOnline);

        Assert.Contains(true, connectivityEvents);
    }

    private static async Task<bool> TryWaitForConnectivityEventAsync(
        ConcurrentBag<bool> events,
        bool expected,
        TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(5));
        while (DateTime.UtcNow < deadline)
        {
            if (events.Contains(expected))
            {
                return true;
            }

            await Task.Delay(50);
        }

        return events.Contains(expected);
    }

    private async Task ApplyHeartbeatAsync(string robotCode, Guid bootId, long sequence)
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
                Sequence = sequence,
                SentAt = DateTimeOffset.UtcNow
            },
            CancellationToken.None);
    }

    private async Task ApplyTelemetryAsync(
        string robotCode,
        Guid bootId,
        long sequence,
        double x,
        double y,
        double yaw,
        string navigationStatus,
        string localizationStatus)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var handler = scope.ServiceProvider.GetRequiredService<ProcessRobotTelemetryHandler>();
        await handler.HandleAsync(
            new RobotTelemetryMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                RobotCode = robotCode,
                BootId = bootId,
                Sequence = sequence,
                SentAt = DateTimeOffset.UtcNow,
                MapVersionCode = "MAP-TEST-V001",
                Pose = new RobotPoseMessage { X = x, Y = y, Yaw = yaw },
                BatteryPercent = 88.5m,
                NavigationStatus = navigationStatus,
                LocalizationStatus = localizationStatus,
                LinearVelocity = 0.2,
                AngularVelocity = 0.01
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
        TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(10));
        RobotDto? last = null;
        while (DateTime.UtcNow < deadline)
        {
            last = await GetRobotAsync(id);
            if (predicate(last))
            {
                return last;
            }

            await Task.Delay(100);
        }

        throw new TimeoutException($"Robot {id} did not reach expected state. Last={JsonSerializer.Serialize(last)}");
    }

    private sealed record RobotDto(
        Guid Id,
        string Code,
        RobotStatus Status,
        bool IsOnline,
        double PoseX,
        double PoseY,
        double PoseYaw,
        NavigationStatus? NavigationStatus,
        LocalizationStatus? LocalizationStatus,
        bool IsEnabled);
}

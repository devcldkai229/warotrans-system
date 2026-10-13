using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Enums;
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
        var connectivityEvents = new List<bool>();

        await using var hub = new HubConnectionBuilder()
            .WithUrl(new Uri(Factory.Server.BaseAddress!, "/hubs/notifications"), options =>
            {
                options.HttpMessageHandlerFactory = _ => Factory.Server.CreateHandler();
            })
            .Build();

        hub.On<JsonElement>("robotConnectivityChanged", payload =>
        {
            if (payload.TryGetProperty("isOnline", out var online))
            {
                connectivityEvents.Add(online.GetBoolean());
            }
        });
        await hub.StartAsync();

        await MqttTestPublisher.PublishHeartbeatAsync(created.Code, boot, 1);
        var online = await WaitForRobotAsync(created.Id, r => r.IsOnline);
        Assert.True(online.IsOnline);
        Assert.Equal(RobotStatus.OFFLINE, online.Status);

        await MqttTestPublisher.PublishTelemetryAsync(created.Code, boot, 1, 3.5, 4.5, 1.2, "NAVIGATING", "LOCALIZED");
        var withPose = await WaitForRobotAsync(
            created.Id,
            r => Math.Abs(r.PoseX - 3.5) < 0.001 && r.NavigationStatus == NavigationStatus.NAVIGATING);
        Assert.Equal(3.5, withPose.PoseX);
        Assert.Equal(4.5, withPose.PoseY);
        Assert.Equal(1.2, withPose.PoseYaw);
        Assert.Equal(NavigationStatus.NAVIGATING, withPose.NavigationStatus);
        Assert.Equal(LocalizationStatus.LOCALIZED, withPose.LocalizationStatus);
        Assert.Equal(RobotStatus.OFFLINE, withPose.Status);

        await MqttTestPublisher.PublishTelemetryAsync(created.Code, boot, 1, 0, 0, 0, "FAILED", "LOST");
        await Task.Delay(500);
        var afterStale = await GetRobotAsync(created.Id);
        Assert.Equal(3.5, afterStale.PoseX);
        Assert.Equal(NavigationStatus.NAVIGATING, afterStale.NavigationStatus);

        var offline = await WaitForRobotAsync(created.Id, r => !r.IsOnline, timeout: TimeSpan.FromSeconds(8));
        Assert.False(offline.IsOnline);
        Assert.Equal(RobotStatus.OFFLINE, offline.Status);

        await MqttTestPublisher.PublishHeartbeatAsync(created.Code, boot, 2);
        var backOnline = await WaitForRobotAsync(created.Id, r => r.IsOnline);
        Assert.True(backOnline.IsOnline);

        Assert.Contains(true, connectivityEvents);
        Assert.Contains(false, connectivityEvents);
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

            await Task.Delay(200);
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

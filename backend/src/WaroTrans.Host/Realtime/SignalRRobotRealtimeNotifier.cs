using Microsoft.AspNetCore.SignalR;
using WaroTrans.Fleet.Abstractions;
using WaroTrans.Fleet.Enums;
using WaroTrans.Host.Hubs;

namespace WaroTrans.Host.Realtime;

public sealed class SignalRRobotRealtimeNotifier(IHubContext<NotificationsHub> hub) : IRobotRealtimeNotifier
{
    public Task NotifyConnectivityChangedAsync(
        Guid robotId,
        string robotCode,
        bool isOnline,
        RobotStatus status,
        DateTimeOffset? lastHeartbeatAt,
        CancellationToken cancellationToken = default)
    {
        return hub.Clients.All.SendAsync(
            "robotConnectivityChanged",
            new
            {
                robotId,
                robotCode,
                isOnline,
                status = status.ToString(),
                lastHeartbeatAt
            },
            cancellationToken);
    }

    public Task NotifyTelemetryUpdatedAsync(
        Guid robotId,
        string robotCode,
        double poseX,
        double poseY,
        double poseYaw,
        decimal batteryPercent,
        NavigationStatus? navigationStatus,
        LocalizationStatus? localizationStatus,
        DateTimeOffset? lastTelemetryAt,
        CancellationToken cancellationToken = default)
    {
        return hub.Clients.All.SendAsync(
            "robotTelemetryUpdated",
            new
            {
                robotId,
                robotCode,
                poseX,
                poseY,
                poseYaw,
                batteryPercent,
                navigationStatus = navigationStatus?.ToString(),
                localizationStatus = localizationStatus?.ToString(),
                lastTelemetryAt
            },
            cancellationToken);
    }
}

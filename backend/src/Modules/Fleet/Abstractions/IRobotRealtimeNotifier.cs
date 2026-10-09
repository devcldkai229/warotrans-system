using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Abstractions;

public interface IRobotRealtimeNotifier
{
    Task NotifyConnectivityChangedAsync(
        Guid robotId,
        string robotCode,
        bool isOnline,
        RobotStatus status,
        DateTimeOffset? lastHeartbeatAt,
        CancellationToken cancellationToken = default);

    Task NotifyTelemetryUpdatedAsync(
        Guid robotId,
        string robotCode,
        double poseX,
        double poseY,
        double poseYaw,
        decimal batteryPercent,
        NavigationStatus? navigationStatus,
        LocalizationStatus? localizationStatus,
        DateTimeOffset? lastTelemetryAt,
        CancellationToken cancellationToken = default);
}

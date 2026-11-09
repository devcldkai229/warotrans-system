using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>Backend → robots: retained announcement of the traffic coordinator epoch in charge.</summary>
public interface IMqttTrafficEpochPublisher
{
    Task PublishEpochAsync(TrafficEpochMessage message, CancellationToken cancellationToken = default);

    /// <summary>Tell one robot why its traffic_plan was not granted (KEEPOUT, conflict, …).</summary>
    Task PublishPlanRejectAsync(
        string robotCode,
        long planRevision,
        string? reason,
        string? waitingReason,
        string? blocker,
        CancellationToken cancellationToken = default);
}

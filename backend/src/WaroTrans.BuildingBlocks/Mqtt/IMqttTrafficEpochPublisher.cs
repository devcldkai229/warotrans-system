using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>Backend → robots: retained announcement of the traffic coordinator epoch in charge.</summary>
public interface IMqttTrafficEpochPublisher
{
    Task PublishEpochAsync(TrafficEpochMessage message, CancellationToken cancellationToken = default);
}

using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>Fire-and-forget manual drive setpoints (QoS 0). Not a robot command: nothing is persisted.</summary>
public interface IMqttRobotTeleopPublisher
{
    Task PublishAsync(RobotTeleopMessage message, CancellationToken cancellationToken = default);
}

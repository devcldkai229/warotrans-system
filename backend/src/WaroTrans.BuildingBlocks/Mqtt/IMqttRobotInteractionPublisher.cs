using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>
/// Publishes HUMAN_INTERACTION arming/result messages (not RobotCommand).
/// </summary>
public interface IMqttRobotInteractionPublisher
{
    Task PublishRequestAsync(RobotInteractionRequestMessage message, CancellationToken cancellationToken = default);
    Task PublishResultAsync(RobotInteractionResultMessage message, CancellationToken cancellationToken = default);
}

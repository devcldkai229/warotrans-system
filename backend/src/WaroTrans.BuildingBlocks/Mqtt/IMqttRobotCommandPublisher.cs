using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt;

public interface IMqttRobotCommandPublisher
{
    Task PublishAsync(RobotCommandMessage message, CancellationToken cancellationToken = default);
}

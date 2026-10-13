using System.Collections.Concurrent;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.IntegrationTests.Infrastructure;

public sealed class CapturingMqttRobotCommandPublisher : IMqttRobotCommandPublisher
{
    public ConcurrentQueue<RobotCommandMessage> Published { get; } = new();

    public Task PublishAsync(RobotCommandMessage message, CancellationToken cancellationToken = default)
    {
        Published.Enqueue(message);
        return Task.CompletedTask;
    }
}

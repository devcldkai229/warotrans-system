using System.Collections.Concurrent;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.IntegrationTests.Infrastructure;

public sealed class CapturingMqttRobotCommandPublisher
    : IMqttRobotCommandPublisher, IMqttRobotTeleopPublisher, IMqttRobotInteractionPublisher
{
    public ConcurrentQueue<RobotCommandMessage> Published { get; } = new();
    public ConcurrentQueue<RobotTeleopMessage> PublishedTeleop { get; } = new();
    public ConcurrentQueue<RobotInteractionRequestMessage> PublishedInteractionRequests { get; } = new();
    public ConcurrentQueue<RobotInteractionResultMessage> PublishedInteractionResults { get; } = new();

    public Task PublishAsync(RobotCommandMessage message, CancellationToken cancellationToken = default)
    {
        Published.Enqueue(message);
        return Task.CompletedTask;
    }

    public Task PublishAsync(RobotTeleopMessage message, CancellationToken cancellationToken = default)
    {
        PublishedTeleop.Enqueue(message);
        return Task.CompletedTask;
    }

    public Task PublishRequestAsync(RobotInteractionRequestMessage message, CancellationToken cancellationToken = default)
    {
        PublishedInteractionRequests.Enqueue(message);
        return Task.CompletedTask;
    }

    public Task PublishResultAsync(RobotInteractionResultMessage message, CancellationToken cancellationToken = default)
    {
        PublishedInteractionResults.Enqueue(message);
        return Task.CompletedTask;
    }
}

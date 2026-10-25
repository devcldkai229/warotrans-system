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

    private Exception? _failNext;

    /// <summary>The next command publish throws this (once), e.g. to play an unreachable broker.</summary>
    public void FailNextCommandWith(Exception failure) => Volatile.Write(ref _failNext, failure);

    public Task PublishAsync(RobotCommandMessage message, CancellationToken cancellationToken = default)
    {
        if (Interlocked.Exchange(ref _failNext, null) is { } failure)
        {
            return Task.FromException(failure);
        }

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

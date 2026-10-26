using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>
/// Fleet-owned handlers for robot MQTT ingress. BuildingBlocks subscriber routes here.
/// </summary>
public interface IRobotMqttIngress
{
    Task HandleHeartbeatAsync(RobotHeartbeatMessage message, CancellationToken cancellationToken);
    Task HandleTelemetryAsync(RobotTelemetryMessage message, CancellationToken cancellationToken);
    Task HandleCommandAckAsync(RobotCommandAckMessage message, CancellationToken cancellationToken);
    Task HandleCommandResultAsync(RobotCommandResultMessage message, CancellationToken cancellationToken);
    Task HandleInteractionConfirmAsync(RobotInteractionConfirmMessage message, CancellationToken cancellationToken);
    Task HandleTrafficProgressAsync(TrafficProgressMessage message, CancellationToken cancellationToken);
    Task HandleAuthorityStateAsync(AuthorityStateMessage message, CancellationToken cancellationToken);
}

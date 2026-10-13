using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Features.ProcessRobotCommandAck;
using WaroTrans.Fleet.Features.ProcessRobotCommandResult;
using WaroTrans.Fleet.Features.ProcessRobotHeartbeat;
using WaroTrans.Fleet.Features.ProcessRobotTelemetry;

namespace WaroTrans.Fleet.Mqtt;

public sealed class RobotMqttIngress(
    ProcessRobotHeartbeatHandler heartbeatHandler,
    ProcessRobotTelemetryHandler telemetryHandler,
    ProcessRobotCommandAckHandler commandAckHandler,
    ProcessRobotCommandResultHandler commandResultHandler) : IRobotMqttIngress
{
    public Task HandleHeartbeatAsync(RobotHeartbeatMessage message, CancellationToken cancellationToken) =>
        heartbeatHandler.HandleAsync(message, cancellationToken);

    public Task HandleTelemetryAsync(RobotTelemetryMessage message, CancellationToken cancellationToken) =>
        telemetryHandler.HandleAsync(message, cancellationToken);

    public Task HandleCommandAckAsync(RobotCommandAckMessage message, CancellationToken cancellationToken) =>
        commandAckHandler.HandleAsync(message, cancellationToken);

    public Task HandleCommandResultAsync(RobotCommandResultMessage message, CancellationToken cancellationToken) =>
        commandResultHandler.HandleAsync(message, cancellationToken);
}

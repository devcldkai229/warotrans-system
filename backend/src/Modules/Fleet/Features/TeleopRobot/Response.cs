namespace WaroTrans.Fleet.Features.TeleopRobot;

/// <summary>The setpoint actually sent (after the backend cap). The robot may clamp further.</summary>
public sealed record TeleopRobotResponse(Guid RobotId, string RobotCode, double Linear, double Angular);

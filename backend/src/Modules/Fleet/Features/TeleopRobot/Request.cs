namespace WaroTrans.Fleet.Features.TeleopRobot;

/// <summary>
/// Manual drive setpoint. Linear in m/s (+ forward), Angular in rad/s (+ left). <c>{0, 0}</c> stops.
/// The console repeats it every ~200 ms while a direction is held.
/// <c>Assist</c> (default true): the robot slows down and stops before an obstacle in the direction of travel.
/// </summary>
public sealed record TeleopRobotRequest(double Linear, double Angular, bool? Assist = null);

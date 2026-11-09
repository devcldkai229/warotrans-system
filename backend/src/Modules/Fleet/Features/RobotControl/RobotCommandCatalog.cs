using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Features.RobotControl;

/// <param name="Code">What a client offers: STOP, PAUSE, RESUME, MANUAL_DRIVE, RESTART_STACK, REBOOT, SHUTDOWN, LOCALIZE, DOCK, CHARGE.</param>
/// <param name="Supported">False means do not show it as an action.</param>
/// <param name="Reason">Why it is not supported now.</param>
/// <param name="Permission">What the caller needs.</param>
/// <param name="AckTimeoutSeconds">How long the robot has to answer. Null when no answer is expected.</param>
/// <param name="ResultTimeoutSeconds">How long after the answer the result may take before the state says UNKNOWN.</param>
/// <param name="Acknowledgement">ACK_AND_RESULT, STATE_FROM_TELEMETRY, LEASE or NONE.</param>
public sealed record RobotCommandCatalogItem(
    string Code,
    bool Supported,
    string? Reason,
    string Permission,
    int? AckTimeoutSeconds,
    int? ResultTimeoutSeconds,
    string Acknowledgement);

/// <summary>
/// FLT-02: everything a robot could be asked outside a Job, and whether this robot can do it now. PAUSE is the soft stop:
/// the same hold as STOP, kept apart because resuming the Job releases it. LOCALIZE, DOCK and CHARGE have no command on
/// the robot, or no hardware behind them, so they are listed as unsupported and never offered.
/// </summary>
public static class RobotCommandCatalog
{
    public static readonly TimeSpan StopVerifyTimeout = TimeSpan.FromSeconds(30);

    private const string NotImplementedOnRobot = "not_implemented_on_robot";
    private const string NoHardware = "no_hardware";
    private const string Offline = "robot_offline";

    public static IReadOnlyList<RobotCommandCatalogItem> For(Robot robot, DateTimeOffset now, int ackTimeoutSeconds)
    {
        var ifOnline = robot.IsOnline ? null : Offline;
        var verify = (int)StopVerifyTimeout.TotalSeconds;
        return
        [
            new("STOP", robot.IsOnline, ifOnline, Permissions.RobotStop, ackTimeoutSeconds, verify, "ACK_AND_RESULT"),
            new("PAUSE", robot.IsOnline, ifOnline, Permissions.RobotStop, ackTimeoutSeconds, verify, "ACK_AND_RESULT"),
            new("RESUME", robot.IsOnline, ifOnline, Permissions.RobotConfigure, ackTimeoutSeconds, null, "STATE_FROM_TELEMETRY"),
            new("MANUAL_DRIVE", robot.IsOnline && robot.IsEnabled, robot.IsEnabled ? ifOnline : "robot_disabled", Permissions.RobotManualDrive, null, null, "LEASE"),
            SystemAction(robot, "RESTART_STACK", ackTimeoutSeconds),
            SystemAction(robot, "REBOOT", ackTimeoutSeconds),
            SystemAction(robot, "SHUTDOWN", ackTimeoutSeconds),
            new("LOCALIZE", false, NotImplementedOnRobot, Permissions.RobotCommand, null, null, "NONE"),
            new("DOCK", false, NoHardware, Permissions.RobotCommand, null, null, "NONE"),
            new("CHARGE", false, NoHardware, Permissions.RobotCommand, null, null, "NONE")
        ];
    }

    private static RobotCommandCatalogItem SystemAction(Robot robot, string action, int ackTimeoutSeconds)
    {
        var reason = !robot.IsOnline ? Offline : robot.Supports(action) ? null : "robot_did_not_announce_it";
        return new(action, reason is null, reason, Permissions.RobotPower, ackTimeoutSeconds, null, "ACK_AND_RESULT");
    }
}

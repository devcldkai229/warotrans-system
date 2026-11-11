namespace WaroTrans.Fleet.Enums;

public enum RobotCommandType
{
    NAVIGATE_TO_POSE,
    CANCEL,
    EXTEND_AUTHORITY,
    RENEW_AUTHORITY,
    REVOKE_AUTHORITY,
    /// <summary>Cancel the active goal and hold every motion until RESUME (RB-03). payload.mode STOP or PAUSE.</summary>
    STOP,
    RESUME,
    /// <summary>RESTART_STACK / REBOOT / SHUTDOWN of the robot computer (RB-09).</summary>
    SYSTEM_ACTION,
    /// <summary>Re-localize: the robot sets its pose estimate to a map endpoint where an operator says it stands.</summary>
    LOCALIZE
}

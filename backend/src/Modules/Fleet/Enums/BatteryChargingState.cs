namespace WaroTrans.Fleet.Enums;

/// <summary>
/// Reported charging state. Voltage alone cannot tell charging apart, so the robot reports UNKNOWN unless an
/// independent source confirms it. Informational only: it never changes <see cref="RobotStatus"/>.
/// </summary>
public enum BatteryChargingState
{
    UNKNOWN,
    CHARGING,
    NOT_CHARGING
}

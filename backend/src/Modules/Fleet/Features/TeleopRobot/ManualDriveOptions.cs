namespace WaroTrans.Fleet.Features.TeleopRobot;

public sealed class ManualDriveOptions
{
    public const string SectionName = "ManualDrive";

    /// <summary>Enable after the robot gateway supports sequenced setpoints through its motion authority and watchdog.</summary>
    public bool EnableSequencedLease { get; set; }
}

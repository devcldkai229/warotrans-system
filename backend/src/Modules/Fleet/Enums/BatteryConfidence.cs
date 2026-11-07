namespace WaroTrans.Fleet.Enums;

public enum BatteryConfidence
{
    /// <summary>Voltage-only reading taken at rest (near open-circuit voltage).</summary>
    MEDIUM,
    /// <summary>Under load, recovering after a stop, or restored after a restart.</summary>
    LOW,
    NONE
}

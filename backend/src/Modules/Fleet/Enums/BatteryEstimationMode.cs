namespace WaroTrans.Fleet.Enums;

/// <summary>Where a robot's battery percent comes from (MQTT telemetry <c>batteryEstimationMode</c>).</summary>
public enum BatteryEstimationMode
{
    /// <summary>Voltage divider on the ESP32 ADC + OCV table on the Pi (no current sensor).</summary>
    VOLTAGE_ONLY,
    /// <summary>Simulation fixed value.</summary>
    SIMULATED,
    /// <summary>A percent sent without a mode (older gateway, test tools).</summary>
    REPORTED,
    /// <summary>No valid measurement: the percent is unknown (null), never 0.</summary>
    UNAVAILABLE
}

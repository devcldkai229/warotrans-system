using FluentValidation.TestHelper;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.BuildingBlocks.Mqtt.Validation;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.ProcessRobotTelemetry;

namespace WaroTrans.UnitTests.Fleet.Battery;

public class BatteryTelemetryContractTests
{
    private static RobotTelemetryMessage Message(Action<RobotTelemetryMessage> configure)
    {
        var message = new RobotTelemetryMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            RobotCode = "RBT-001",
            BootId = Guid.NewGuid(),
            Sequence = 1,
            SentAt = DateTimeOffset.UtcNow,
            NavigationStatus = "IDLE",
            LocalizationStatus = "LOST"
        };
        configure(message);
        return message;
    }

    [Fact]
    public void Voltage_only_fields_are_accepted()
    {
        var result = new RobotTelemetryMessageValidator().TestValidate(Message(m =>
        {
            m.BatteryPercent = 63.4m;
            m.BatteryVoltage = 11.43m;
            m.BatteryEstimationMode = "VOLTAGE_ONLY";
            m.BatteryConfidence = "MEDIUM";
            m.BatteryChargingState = "UNKNOWN";
            m.BatteryMeasuredAt = DateTimeOffset.UtcNow;
        }));
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Unavailable_without_percent_is_accepted_and_with_percent_rejected()
    {
        var validator = new RobotTelemetryMessageValidator();
        validator.TestValidate(Message(m =>
        {
            m.BatteryEstimationMode = "UNAVAILABLE";
            m.BatteryConfidence = "NONE";
        })).ShouldNotHaveAnyValidationErrors();
        validator.TestValidate(Message(m =>
        {
            m.BatteryEstimationMode = "UNAVAILABLE";
            m.BatteryPercent = 0m;
        })).ShouldHaveValidationErrorFor(x => x.BatteryPercent);
    }

    [Fact]
    public void Unknown_battery_enum_values_and_bad_voltage_are_rejected()
    {
        var validator = new RobotTelemetryMessageValidator();
        validator.TestValidate(Message(m => m.BatteryEstimationMode = "HYBRID"))
            .ShouldHaveValidationErrorFor(x => x.BatteryEstimationMode);
        validator.TestValidate(Message(m => m.BatteryConfidence = "HIGH"))
            .ShouldHaveValidationErrorFor(x => x.BatteryConfidence);
        validator.TestValidate(Message(m => m.BatteryChargingState = "FULL"))
            .ShouldHaveValidationErrorFor(x => x.BatteryChargingState);
        validator.TestValidate(Message(m => m.BatteryVoltage = 31m))
            .ShouldHaveValidationErrorFor(x => x.BatteryVoltage);
    }

    [Fact]
    public void Legacy_message_without_battery_fields_maps_to_unknown()
    {
        var reading = ProcessRobotTelemetryHandler.ToBatteryReading(Message(_ => { }));
        Assert.Null(reading.Percent);
        Assert.Null(reading.Mode);
    }

    [Fact]
    public void Message_fields_map_to_the_battery_reading()
    {
        var reading = ProcessRobotTelemetryHandler.ToBatteryReading(Message(m =>
        {
            m.BatteryPercent = 55m;
            m.BatteryVoltage = 11.2m;
            m.BatteryEstimationMode = "VOLTAGE_ONLY";
            m.BatteryConfidence = "LOW";
            m.BatteryChargingState = "UNKNOWN";
        }));
        Assert.Equal(55m, reading.Percent);
        Assert.Equal(11.2m, reading.Voltage);
        Assert.Equal(BatteryEstimationMode.VOLTAGE_ONLY, reading.Mode);
        Assert.Equal(BatteryConfidence.LOW, reading.Confidence);
        Assert.Equal(BatteryChargingState.UNKNOWN, reading.ChargingState);
    }
}

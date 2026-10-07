using FluentValidation.TestHelper;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.BuildingBlocks.Mqtt.Validation;

namespace WaroTrans.UnitTests.BuildingBlocks.Mqtt;

public class RobotMqttMessageValidatorTests
{
    [Fact]
    public void Heartbeat_valid_message_passes()
    {
        var validator = new RobotHeartbeatMessageValidator();
        var result = validator.TestValidate(new RobotHeartbeatMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            RobotCode = "RBT-001",
            BootId = Guid.NewGuid(),
            Sequence = 1,
            SentAt = DateTimeOffset.UtcNow
        });
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Heartbeat_rejects_wrong_schemaVersion()
    {
        var validator = new RobotHeartbeatMessageValidator();
        var result = validator.TestValidate(new RobotHeartbeatMessage
        {
            SchemaVersion = 2,
            MessageId = Guid.NewGuid(),
            RobotCode = "RBT-001",
            BootId = Guid.NewGuid(),
            Sequence = 1,
            SentAt = DateTimeOffset.UtcNow
        });
        result.ShouldHaveValidationErrorFor(x => x.SchemaVersion);
    }

    [Fact]
    public void Telemetry_rejects_unknown_navigationStatus()
    {
        var validator = new RobotTelemetryMessageValidator();
        var result = validator.TestValidate(new RobotTelemetryMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            RobotCode = "RBT-001",
            BootId = Guid.NewGuid(),
            Sequence = 1,
            SentAt = DateTimeOffset.UtcNow,
            Pose = new RobotPoseMessage(),
            BatteryPercent = 50,
            NavigationStatus = "RUNNING",
            LocalizationStatus = "LOCALIZED"
        });
        result.ShouldHaveValidationErrorFor(x => x.NavigationStatus);
    }

    [Fact]
    public void Telemetry_valid_message_passes()
    {
        var validator = new RobotTelemetryMessageValidator();
        var result = validator.TestValidate(new RobotTelemetryMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            RobotCode = "RBT-001",
            BootId = Guid.NewGuid(),
            Sequence = 1,
            SentAt = DateTimeOffset.UtcNow,
            Pose = new RobotPoseMessage { X = 1, Y = 2, Yaw = 0.1 },
            BatteryPercent = 80,
            NavigationStatus = "IDLE",
            LocalizationStatus = "LOCALIZED"
        });
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Telemetry_allows_null_battery_and_null_pose_when_LOST()
    {
        var validator = new RobotTelemetryMessageValidator();
        var result = validator.TestValidate(new RobotTelemetryMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            RobotCode = "RBT-001",
            BootId = Guid.NewGuid(),
            Sequence = 1,
            SentAt = DateTimeOffset.UtcNow,
            Pose = null,
            BatteryPercent = null,
            NavigationStatus = "IDLE",
            LocalizationStatus = "LOST"
        });
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Telemetry_requires_pose_when_LOCALIZED()
    {
        var validator = new RobotTelemetryMessageValidator();
        var result = validator.TestValidate(new RobotTelemetryMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            RobotCode = "RBT-001",
            BootId = Guid.NewGuid(),
            Sequence = 1,
            SentAt = DateTimeOffset.UtcNow,
            Pose = null,
            BatteryPercent = null,
            NavigationStatus = "IDLE",
            LocalizationStatus = "LOCALIZED"
        });
        result.ShouldHaveValidationErrorFor(x => x.Pose);
    }
}

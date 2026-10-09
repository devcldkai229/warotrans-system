using System.Text.Json;
using FluentValidation.TestHelper;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.BuildingBlocks.Mqtt.Validation;

namespace WaroTrans.UnitTests.BuildingBlocks.Mqtt;

public class RobotCommandMqttTests
{
    [Fact]
    public void Topics_include_command_ack_result()
    {
        Assert.Equal("warotrans/v1/robots/RBT-001/command", RobotMqttTopics.Command("warotrans/v1", "RBT-001"));
        Assert.Equal("warotrans/v1/robots/RBT-001/command_ack", RobotMqttTopics.CommandAck("warotrans/v1", "RBT-001"));
        Assert.Equal("warotrans/v1/robots/RBT-001/command_result", RobotMqttTopics.CommandResult("warotrans/v1", "RBT-001"));

        Assert.True(RobotMqttTopics.TryParse(
            "warotrans/v1/robots/RBT-001/command_ack",
            "warotrans/v1",
            out var code,
            out var kind));
        Assert.Equal("RBT-001", code);
        Assert.Equal(RobotMqttTopics.CommandAckSuffix, kind);
    }

    [Fact]
    public void Command_navigate_valid()
    {
        var validator = new RobotCommandMessageValidator();
        var payload = JsonSerializer.SerializeToElement(new NavigateToPosePayload
        {
            FrameId = "map",
            X = 1,
            Y = 2,
            Yaw = 0.5
        });
        var result = validator.TestValidate(new RobotCommandMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            CommandId = Guid.NewGuid(),
            RobotCode = "RBT-001",
            Type = RobotCommandTypes.NavigateToPose,
            IssuedAt = DateTimeOffset.UtcNow,
            Payload = payload
        });
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Command_rejects_unknown_type()
    {
        var validator = new RobotCommandMessageValidator();
        var result = validator.TestValidate(new RobotCommandMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            CommandId = Guid.NewGuid(),
            RobotCode = "RBT-001",
            Type = "DOCK",
            IssuedAt = DateTimeOffset.UtcNow,
            Payload = JsonSerializer.SerializeToElement(new { })
        });
        result.ShouldHaveValidationErrorFor(x => x.Type);
    }

    [Fact]
    public void Ack_and_result_validators_pass()
    {
        var ack = new RobotCommandAckMessageValidator().TestValidate(new RobotCommandAckMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            CommandId = Guid.NewGuid(),
            RobotCode = "RBT-001",
            Accepted = true,
            SentAt = DateTimeOffset.UtcNow
        });
        ack.ShouldNotHaveAnyValidationErrors();

        var result = new RobotCommandResultMessageValidator().TestValidate(new RobotCommandResultMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            CommandId = Guid.NewGuid(),
            RobotCode = "RBT-001",
            Outcome = RobotCommandOutcomes.Succeeded,
            SentAt = DateTimeOffset.UtcNow
        });
        result.ShouldNotHaveAnyValidationErrors();
    }
}

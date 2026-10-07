using FluentValidation;
using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt.Validation;

public sealed class RobotCommandAckMessageValidator : AbstractValidator<RobotCommandAckMessage>
{
    public RobotCommandAckMessageValidator()
    {
        RuleFor(x => x.SchemaVersion).Equal(1);
        RuleFor(x => x.MessageId).NotEmpty();
        RuleFor(x => x.CommandId).NotEmpty();
        RuleFor(x => x.RobotCode).NotEmpty().MaximumLength(30);
        RuleFor(x => x.SentAt).Must(t => t != default).WithMessage("SentAt is required.");
        RuleFor(x => x.ReasonCode).MaximumLength(80).When(x => x.ReasonCode is not null);
    }
}

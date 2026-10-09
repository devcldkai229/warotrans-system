using FluentValidation;
using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt.Validation;

public sealed class RobotHeartbeatMessageValidator : AbstractValidator<RobotHeartbeatMessage>
{
    public RobotHeartbeatMessageValidator()
    {
        RuleFor(x => x.SchemaVersion).Equal(1);
        RuleFor(x => x.MessageId).NotEmpty();
        RuleFor(x => x.RobotCode).NotEmpty().MaximumLength(30);
        RuleFor(x => x.BootId).NotEmpty();
        RuleFor(x => x.Sequence).GreaterThanOrEqualTo(0);
        RuleFor(x => x.SentAt).Must(t => t != default).WithMessage("SentAt is required.");
    }
}

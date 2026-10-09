using FluentValidation;
using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt.Validation;

public sealed class RobotCommandResultMessageValidator : AbstractValidator<RobotCommandResultMessage>
{
    public RobotCommandResultMessageValidator()
    {
        RuleFor(x => x.SchemaVersion).Equal(1);
        RuleFor(x => x.MessageId).NotEmpty();
        RuleFor(x => x.CommandId).NotEmpty();
        RuleFor(x => x.RobotCode).NotEmpty().MaximumLength(30);
        RuleFor(x => x.Outcome)
            .Must(o => o is RobotCommandOutcomes.Succeeded
                or RobotCommandOutcomes.Failed
                or RobotCommandOutcomes.Canceled)
            .WithMessage("Outcome must be SUCCEEDED, FAILED, or CANCELED.");
        RuleFor(x => x.SentAt).Must(t => t != default).WithMessage("SentAt is required.");
        RuleFor(x => x.ErrorCode).MaximumLength(80).When(x => x.ErrorCode is not null);
    }
}

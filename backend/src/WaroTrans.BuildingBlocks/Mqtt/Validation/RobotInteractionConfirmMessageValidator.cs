using FluentValidation;
using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt.Validation;

public sealed class RobotInteractionConfirmMessageValidator : AbstractValidator<RobotInteractionConfirmMessage>
{
    private static readonly HashSet<string> AllowedTypes = new(StringComparer.Ordinal)
    {
        "PICKUP_CONFIRM",
        "DROPOFF_CONFIRM"
    };

    public RobotInteractionConfirmMessageValidator()
    {
        RuleFor(x => x.SchemaVersion).Equal(1);
        RuleFor(x => x.MessageId).NotEmpty();
        RuleFor(x => x.RobotCode).NotEmpty().MaximumLength(30);
        RuleFor(x => x.BootId).NotEmpty();
        RuleFor(x => x.Sequence).GreaterThan(0);
        RuleFor(x => x.SentAt).Must(t => t != default).WithMessage("SentAt is required.");
        RuleFor(x => x.JobId).NotEmpty();
        RuleFor(x => x.JobStepId).NotEmpty();
        RuleFor(x => x.InteractionType).NotEmpty().Must(t => AllowedTypes.Contains(t))
            .WithMessage("InteractionType must be PICKUP_CONFIRM or DROPOFF_CONFIRM.");
        RuleFor(x => x.ContainerId).NotEmpty();
        RuleFor(x => x.EndpointId).NotEmpty();
        RuleFor(x => x.Source).Equal("ROBOT_BUTTON");
    }
}

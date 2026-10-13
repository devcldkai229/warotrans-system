using System.Text.Json;
using FluentValidation;
using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt.Validation;

public sealed class RobotCommandMessageValidator : AbstractValidator<RobotCommandMessage>
{
    public RobotCommandMessageValidator()
    {
        RuleFor(x => x.SchemaVersion).Equal(1);
        RuleFor(x => x.MessageId).NotEmpty();
        RuleFor(x => x.CommandId).NotEmpty();
        RuleFor(x => x.RobotCode).NotEmpty().MaximumLength(30);
        RuleFor(x => x.Type)
            .Must(t => t is RobotCommandTypes.NavigateToPose or RobotCommandTypes.Cancel)
            .WithMessage("Type must be NAVIGATE_TO_POSE or CANCEL.");
        RuleFor(x => x.IssuedAt).Must(t => t != default).WithMessage("IssuedAt is required.");
        RuleFor(x => x.Payload)
            .Must(p => p.ValueKind is JsonValueKind.Object)
            .WithMessage("Payload must be a JSON object.");

        When(x => x.Type == RobotCommandTypes.NavigateToPose, () =>
        {
            RuleFor(x => x.Payload).Custom((payload, ctx) =>
            {
                try
                {
                    var pose = payload.Deserialize<NavigateToPosePayload>();
                    if (pose is null || string.IsNullOrWhiteSpace(pose.FrameId))
                    {
                        ctx.AddFailure("Payload.frameId is required for NAVIGATE_TO_POSE.");
                    }
                }
                catch (JsonException)
                {
                    ctx.AddFailure("Payload is invalid for NAVIGATE_TO_POSE.");
                }
            });
        });

        When(x => x.Type == RobotCommandTypes.Cancel, () =>
        {
            RuleFor(x => x.Payload).Custom((payload, ctx) =>
            {
                try
                {
                    var cancel = payload.Deserialize<CancelCommandPayload>();
                    if (cancel is null || cancel.TargetCommandId == Guid.Empty)
                    {
                        ctx.AddFailure("Payload.targetCommandId is required for CANCEL.");
                    }
                }
                catch (JsonException)
                {
                    ctx.AddFailure("Payload is invalid for CANCEL.");
                }
            });
        });
    }
}

using FluentValidation;
using WaroTrans.BuildingBlocks.Mqtt.Messages;

namespace WaroTrans.BuildingBlocks.Mqtt.Validation;

public sealed class RobotTelemetryMessageValidator : AbstractValidator<RobotTelemetryMessage>
{
    private static readonly HashSet<string> NavigationStatuses =
    [
        "IDLE", "NAVIGATING", "PAUSED", "SUCCEEDED", "FAILED", "CANCELED"
    ];

    private static readonly HashSet<string> LocalizationStatuses =
    [
        "LOCALIZED", "LOST", "UNKNOWN"
    ];

    public RobotTelemetryMessageValidator()
    {
        RuleFor(x => x.SchemaVersion).Equal(1);
        RuleFor(x => x.MessageId).NotEmpty();
        RuleFor(x => x.RobotCode).NotEmpty().MaximumLength(30);
        RuleFor(x => x.BootId).NotEmpty();
        RuleFor(x => x.Sequence).GreaterThanOrEqualTo(0);
        RuleFor(x => x.SentAt).Must(t => t != default).WithMessage("SentAt is required.");
        RuleFor(x => x.BatteryPercent)
            .InclusiveBetween(0, 100)
            .When(x => x.BatteryPercent.HasValue);
        RuleFor(x => x.NavigationStatus)
            .NotEmpty()
            .Must(s => NavigationStatuses.Contains(s))
            .WithMessage("NavigationStatus must be a known value.");
        RuleFor(x => x.LocalizationStatus)
            .NotEmpty()
            .Must(s => LocalizationStatuses.Contains(s))
            .WithMessage("LocalizationStatus must be a known value.");
        RuleFor(x => x.Pose)
            .NotNull()
            .When(x => x.LocalizationStatus == "LOCALIZED")
            .WithMessage("Pose is required when LocalizationStatus is LOCALIZED.");
        RuleFor(x => x.MapVersionCode).MaximumLength(100).When(x => x.MapVersionCode is not null);
        RuleFor(x => x.ErrorCode).MaximumLength(100).When(x => x.ErrorCode is not null);
    }
}

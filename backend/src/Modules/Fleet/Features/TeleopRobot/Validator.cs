using FluentValidation;

namespace WaroTrans.Fleet.Features.TeleopRobot;

public sealed class TeleopRobotRequestValidator : AbstractValidator<TeleopRobotRequest>
{
    public TeleopRobotRequestValidator()
    {
        RuleFor(x => x.Linear).Must(double.IsFinite).WithMessage("Linear must be a finite number (m/s).");
        RuleFor(x => x.Angular).Must(double.IsFinite).WithMessage("Angular must be a finite number (rad/s).");
    }
}

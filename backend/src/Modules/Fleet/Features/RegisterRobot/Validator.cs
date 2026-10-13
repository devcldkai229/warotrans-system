using FluentValidation;

namespace WaroTrans.Fleet.Features.RegisterRobot;

public sealed class RegisterRobotRequestValidator : AbstractValidator<RegisterRobotRequest>
{
    public RegisterRobotRequestValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty();
        RuleFor(x => x.CurrentMapVersionId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
    }
}

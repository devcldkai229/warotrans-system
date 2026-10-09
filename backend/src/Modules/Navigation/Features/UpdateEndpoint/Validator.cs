using FluentValidation;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Features.UpdateEndpoint;

public sealed class UpdateEndpointValidator : AbstractValidator<UpdateEndpointRequest>
{
    public UpdateEndpointValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(255).WithMessage("Name must not exceed 255 characters.");

        RuleFor(x => x.EndpointType)
            .NotEmpty().WithMessage("EndpointType is required.")
            .IsEnumName(typeof(EndpointType), caseSensitive: false)
            .WithMessage($"EndpointType must be one of: {string.Join(", ", Enum.GetNames<EndpointType>())}.");

        RuleFor(x => x.X)
            .Must(double.IsFinite).WithMessage("X must be a finite number.");

        RuleFor(x => x.Y)
            .Must(double.IsFinite).WithMessage("Y must be a finite number.");

        RuleFor(x => x.Yaw)
            .InclusiveBetween(-Math.PI, Math.PI).WithMessage("Yaw must be between -PI and PI radians.");

        RuleFor(x => x.PositionTolerance)
            .GreaterThan(0).WithMessage("PositionTolerance must be greater than 0.")
            .Must(double.IsFinite).WithMessage("PositionTolerance must be a finite number.");

        RuleFor(x => x.YawTolerance)
            .GreaterThan(0).WithMessage("YawTolerance must be greater than 0.")
            .LessThanOrEqualTo(Math.PI).WithMessage("YawTolerance must not exceed PI radians.");
    }
}

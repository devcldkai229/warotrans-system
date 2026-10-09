using FluentValidation;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Features.CreateEndpoint;

public sealed class CreateEndpointValidator : AbstractValidator<CreateEndpointRequest>
{
    // Code = "EP-" + Name and the code column is varchar(100).
    private const int MaxNameLength = 100 - 3;

    public CreateEndpointValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .Must(name => name is null || name.Trim().Length <= MaxNameLength)
            .WithMessage($"Name must not exceed {MaxNameLength} characters because it is used to generate the Endpoint code.");

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

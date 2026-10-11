using FluentValidation;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Features.CreateEdge;

public sealed class CreateEdgeValidator : AbstractValidator<CreateEdgeRequest>
{
    public CreateEdgeValidator()
    {
        RuleFor(x => x.Geometry)
            .NotNull().WithMessage("Geometry is required.");

        When(x => x.Geometry is not null, () =>
        {
            RuleFor(x => x.Geometry.Points)
                .NotNull().WithMessage("Geometry.Points is required.")
                .Must(points => points is null || points.Count >= 2)
                .WithMessage("Geometry.Points must contain at least 2 points.");

            RuleForEach(x => x.Geometry.Points)
                .NotNull().WithMessage("Geometry point must not be null.")
                .ChildRules(point =>
                {
                    point.RuleFor(p => p.X).Must(double.IsFinite).WithMessage("Point X must be a finite number.");
                    point.RuleFor(p => p.Y).Must(double.IsFinite).WithMessage("Point Y must be a finite number.");
                })
                .When(x => x.Geometry.Points is not null);
        });

        RuleFor(x => x.Direction)
            .NotEmpty().WithMessage("Direction is required.")
            .IsEnumName(typeof(EdgeDirection), caseSensitive: false)
            .WithMessage($"Direction must be one of: {string.Join(", ", Enum.GetNames<EdgeDirection>())}.");

        RuleFor(x => x.Capacity)
            .GreaterThanOrEqualTo(1).WithMessage("Capacity must be at least 1.");

        RuleFor(x => x.MaxSpeed)
            .GreaterThan(0).WithMessage("MaxSpeed must be greater than 0.")
            .Must(speed => double.IsFinite(speed!.Value)).WithMessage("MaxSpeed must be a finite number.")
            .When(x => x.MaxSpeed.HasValue);
    }
}

using FluentValidation;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Geometry;

namespace WaroTrans.Navigation.Features.CreateEdge;

public sealed class CreateEdgeValidator : AbstractValidator<CreateEdgeRequest>
{
    public CreateEdgeValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(255);

        RuleFor(x => x.Geometry)
            .Must(g =>
            {
                try
                {
                    _ = GeoJsonGeometry.ParseLineStringCoordinates(g);
                    return true;
                }
                catch
                {
                    return false;
                }
            })
            .WithMessage("Geometry must be a valid GeoJSON LineString with at least 2 finite [x,y] positions (meters).");

        RuleFor(x => x.WidthMeters)
            .GreaterThan(0).WithMessage("WidthMeters must be greater than 0 (meters).")
            .Must(double.IsFinite).WithMessage("WidthMeters must be a finite number.");

        RuleFor(x => x.Direction)
            .NotEmpty().WithMessage("Direction is required.")
            .IsEnumName(typeof(EdgeDirection), caseSensitive: false)
            .WithMessage($"Direction must be one of: {string.Join(", ", Enum.GetNames<EdgeDirection>())}.");

        RuleFor(x => x.MaxSpeed)
            .GreaterThan(0).WithMessage("MaxSpeed must be greater than 0 (meters/second).")
            .Must(speed => double.IsFinite(speed!.Value)).WithMessage("MaxSpeed must be a finite number.")
            .When(x => x.MaxSpeed.HasValue);
    }
}

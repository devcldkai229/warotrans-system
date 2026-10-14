using FluentValidation;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Geometry;

namespace WaroTrans.Navigation.Features.CreateZone;

public sealed class CreateZoneValidator : AbstractValidator<CreateZoneRequest>
{
    public CreateZoneValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(255);
        RuleFor(x => x.ZoneType)
            .NotEmpty()
            .IsEnumName(typeof(ZoneType), caseSensitive: false)
            .WithMessage($"ZoneType must be one of: {string.Join(", ", Enum.GetNames<ZoneType>())}.");

        RuleFor(x => x.Geometry)
            .Must(g =>
            {
                try
                {
                    _ = GeoJsonGeometry.ParsePolygonRing(g);
                    return true;
                }
                catch
                {
                    return false;
                }
            })
            .WithMessage("Geometry must be a valid closed GeoJSON Polygon in world meters.");

        RuleFor(x => x.Capacity).GreaterThanOrEqualTo(1);
        RuleFor(x => x.MaxSpeed)
            .GreaterThan(0)
            .Must(s => double.IsFinite(s!.Value))
            .When(x => x.MaxSpeed.HasValue);
        RuleFor(x => x.Code).MaximumLength(100).When(x => x.Code is not null);
    }
}

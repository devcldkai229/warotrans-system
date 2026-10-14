using FluentValidation;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Geometry;

namespace WaroTrans.Navigation.Features.UpdateZone;

public sealed class UpdateZoneValidator : AbstractValidator<UpdateZoneRequest>
{
    public UpdateZoneValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(255);
        RuleFor(x => x.ZoneType)
            .NotEmpty()
            .IsEnumName(typeof(ZoneType), caseSensitive: false);
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
    }
}

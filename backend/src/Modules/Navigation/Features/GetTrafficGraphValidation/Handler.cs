using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Navigation.Features.GetTrafficGraphValidation;

public sealed class GetTrafficGraphValidationHandler(TrafficGraphCompileService compileService)
{
    public async Task<TrafficValidationReport> HandleAsync(Guid mapVersionId, CancellationToken cancellationToken = default)
    {
        var bundle = await compileService.CompileAsync(mapVersionId, includeOccupancy: true, cancellationToken);
        return TrafficGraphValidator.Validate(
            mapVersionId,
            bundle.Result.Graph,
            bundle.Result.Issues,
            bundle.ZoneMeta);
    }
}

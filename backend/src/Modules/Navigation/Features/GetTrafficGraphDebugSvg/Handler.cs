using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Navigation.Features.GetTrafficGraphDebugSvg;

public sealed class GetTrafficGraphDebugSvgHandler(TrafficGraphCompileService compileService)
{
    public async Task<string> HandleAsync(Guid mapVersionId, CancellationToken cancellationToken = default)
    {
        var bundle = await compileService.CompileAsync(mapVersionId, includeOccupancy: true, cancellationToken);
        var report = TrafficGraphValidator.Validate(
            mapVersionId,
            bundle.Result.Graph,
            bundle.Result.Issues,
            bundle.ZoneMeta,
            zones: bundle.Zones);
        return TrafficDebugSvgWriter.Write(
            bundle.Result.Graph,
            bundle.Occupancy,
            report.Issues,
            bundle.Zones,
            bundle.Result.RejectedAccessPaths);
    }
}

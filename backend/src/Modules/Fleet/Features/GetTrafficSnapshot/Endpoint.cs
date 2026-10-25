using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.Fleet.Features.GetTrafficSnapshot;

public static class Endpoint
{
    public static RouteGroupBuilder MapGetTrafficSnapshot(this RouteGroupBuilder group)
    {
        group.MapGet("/traffic/snapshot", async (
                ISegmentedTrafficCoordinator coordinator,
                CancellationToken ct) =>
            {
                var snap = await coordinator.GetTrafficSnapshotAsync(ct).ConfigureAwait(false);
                return Results.Ok(snap);
            })
            .WithName("GetTrafficSnapshot")
            .WithTags("Traffic")
            .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        group.MapGet("/traffic/diagnostics", async (
                ISegmentedTrafficCoordinator coordinator,
                CancellationToken ct) =>
            {
                var snap = await coordinator.GetTrafficSnapshotAsync(ct).ConfigureAwait(false);
                return Results.Ok(new
                {
                    snap.Epoch,
                    snap.StateVersion,
                    snap.Phase,
                    waits = snap.Waits,
                    cycles = snap.Cycles,
                    recentEvents = snap.RecentEvents,
                    robotCount = snap.Robots.Length,
                    resourceCount = snap.Resources.Length
                });
            })
            .WithName("GetTrafficDiagnostics")
            .WithTags("Traffic")
            .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        return group;
    }
}

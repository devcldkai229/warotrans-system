using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Fleet.Traffic;
// ITrafficOpsLog in WaroTrans.Fleet.Traffic

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
                ITrafficOpsLog opsLog,
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
                    opsEvents = opsLog.Recent(50),
                    robotCount = snap.Robots.Length,
                    resourceCount = snap.Resources.Length
                });
            })
            .WithName("GetTrafficDiagnostics")
            .WithTags("Traffic")
            .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        group.MapGet("/traffic/ops-log", (
                ITrafficOpsLog opsLog,
                int? take) => Results.Ok(opsLog.Recent(take ?? 100)))
            .WithName("GetTrafficOpsLog")
            .WithTags("Traffic")
            .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        return group;
    }
}

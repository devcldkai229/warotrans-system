using System.Collections.Immutable;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.Fleet.Features.ReconcileTrafficRobot;

public sealed record ReconcileTrafficRobotRequest(
    double PoseX,
    double PoseY,
    bool LocalizationOk,
    IReadOnlyList<int>? OccupiedEdgeIds = null);

public sealed record ReleaseAfterClearanceRequest(
    string OperatorId,
    IReadOnlyList<string>? ResourceIds = null);

public static class Endpoint
{
    public static RouteGroupBuilder MapTrafficOperatorEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/traffic/robots/{robotId:guid}/reconcile", async (
                Guid robotId,
                ReconcileTrafficRobotRequest body,
                ISegmentedTrafficCoordinator coordinator,
                CancellationToken ct) =>
            {
                var edges = (body.OccupiedEdgeIds ?? []).ToImmutableArray();
                // Operator-supplied pose: the operator vouches the robot is stopped there.
                var result = await coordinator.ReconcileRobotAsync(
                    robotId, body.PoseX, body.PoseY, body.LocalizationOk, edges, robotReportsIdle: true, ct)
                    .ConfigureAwait(false);
                return result.Ok ? Results.Ok(result) : Results.Conflict(result);
            })
            .WithName("ReconcileTrafficRobot")
            .WithTags("Traffic")
            .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        group.MapPost("/traffic/robots/{robotId:guid}/release-after-clearance", async (
                Guid robotId,
                ReleaseAfterClearanceRequest body,
                ISegmentedTrafficCoordinator coordinator,
                CancellationToken ct) =>
            {
                var resources = body.ResourceIds?.ToImmutableArray();
                var result = await coordinator.ReleaseAfterPhysicalClearanceAsync(
                    robotId, body.OperatorId, resources, ct).ConfigureAwait(false);
                return result.Ok ? Results.Ok(result) : Results.Conflict(result);
            })
            .WithName("ReleaseTrafficAfterClearance")
            .WithTags("Traffic")
            .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        return group;
    }
}

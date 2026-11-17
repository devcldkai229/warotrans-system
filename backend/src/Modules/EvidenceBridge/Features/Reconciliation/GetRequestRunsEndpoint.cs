using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.EvidenceBridge.Services;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Navigation.Contracts;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.EvidenceBridge.Features.Reconciliation;

public sealed record RequestRunsResponse(
    Guid TransportRequestId,
    string? RequestCode,
    string? TransportRequestStatus,
    IReadOnlyList<TripRunsResponse> Trips);

public sealed record TripRunsResponse(
    Guid JobId,
    string JobNo,
    string Status,
    Guid MapVersionId,
    string? MapVersionCode,
    IReadOnlyList<Guid> ContainerIds,
    IReadOnlyList<AssignmentResponse> Assignments);

public sealed record AssignmentResponse(
    Guid AssignmentId,
    Guid RobotId,
    string? RobotCode,
    string StartReason,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    string? EndReason);

/// <summary>
/// What the source of truth says about a request's trips and robot runs, for the Recorder to repair what an event that
/// never arrived left out. Service token only (no user).
/// </summary>
internal static class GetRequestRunsEndpoint
{
    public static void Map(RouteGroupBuilder group) =>
        group.MapGet("/transport-requests/{id:guid}/runs", async (
                Guid id,
                IJobEvidenceQuery jobs,
                ITransportRequestCodeLookup codes,
                ITransportRequestActivityQuery requests,
                IFleetModule fleet,
                INavigationModule navigation,
                CancellationToken cancellationToken) =>
            {
                var status = await requests.GetStatusAsync(id, cancellationToken);
                if (status is null)
                {
                    return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Transport request not found.");
                }

                var trips = await jobs.GetJobsOfRequestAsync(id, cancellationToken);
                var robotCodes = new Dictionary<Guid, string?>();
                var mapCodes = new Dictionary<Guid, string?>();
                var result = new List<TripRunsResponse>();
                foreach (var trip in trips)
                {
                    if (!mapCodes.ContainsKey(trip.MapVersionId))
                    {
                        mapCodes[trip.MapVersionId] = (await navigation.GetMapVersionAsync(trip.MapVersionId, cancellationToken))?.Code;
                    }

                    var assignments = new List<AssignmentResponse>();
                    foreach (var a in trip.Assignments)
                    {
                        if (!robotCodes.ContainsKey(a.RobotId))
                        {
                            robotCodes[a.RobotId] = (await fleet.GetRobotAsync(a.RobotId, cancellationToken))?.Code;
                        }

                        assignments.Add(new AssignmentResponse(
                            a.AssignmentId, a.RobotId, robotCodes[a.RobotId], a.StartReason, a.StartedAt, a.EndedAt, a.EndReason));
                    }

                    result.Add(new TripRunsResponse(
                        trip.JobId, trip.JobNo, trip.Status, trip.MapVersionId, mapCodes[trip.MapVersionId], trip.ContainerIds,
                        assignments));
                }

                var requestCode = (await codes.GetCodesAsync([id], cancellationToken)).GetValueOrDefault(id);
                return Results.Ok(new RequestRunsResponse(id, requestCode, status, result));
            })
            .AllowAnonymous()
            .AddEndpointFilter<ServiceTokenEndpointFilter>()
            .WithName("EvidenceBridgeGetRequestRuns")
            .WithSummary("Trips and robot runs of a transport request (Evidence reconciliation, service token).");
}

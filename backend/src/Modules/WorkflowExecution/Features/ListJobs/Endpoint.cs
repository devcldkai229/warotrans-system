using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Fleet.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.Shared;

namespace WaroTrans.WorkflowExecution.Features.ListJobs;

public static class ListJobsEndpoint
{
    public static RouteGroupBuilder MapListJobs(this RouteGroupBuilder group)
    {
        group.MapGet("/jobs", async (
            string? status,
            Guid? transportRequestId,
            Guid? robotId,
            int? take,
            JobQueries queries,
            IFleetModule fleet,
            CancellationToken cancellationToken) =>
        {
            JobStatus? parsed = null;
            if (!string.IsNullOrWhiteSpace(status))
            {
                if (!Enum.TryParse<JobStatus>(status, ignoreCase: true, out var value))
                {
                    return Results.ValidationProblem(new Dictionary<string, string[]>
                    {
                        ["status"] = ["Status must be a valid JobStatus."]
                    });
                }

                parsed = value;
            }

            var limit = Math.Clamp(take ?? 50, 1, 200);
            // A Job does not store its robot as a column; Fleet's assignments say which Jobs a robot ran.
            var jobIds = robotId is { } id ? await fleet.GetRecentJobIdsAsync(id, limit, cancellationToken) : null;
            var (items, total) = await queries.ListAsync(parsed, transportRequestId, limit, cancellationToken, jobIds);
            return Results.Ok(new { items, total });
        })
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("ListJobs")
        .WithSummary("List Jobs, optionally by status, TransportRequest and robot (the robot's most recent Jobs)");

        return group;
    }
}

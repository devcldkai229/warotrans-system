using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
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
            int? take,
            JobQueries queries,
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

            var (items, total) = await queries.ListAsync(parsed, transportRequestId, Math.Clamp(take ?? 50, 1, 200), cancellationToken);
            return Results.Ok(new { items, total });
        })
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("ListJobs")
        .WithSummary("List Jobs, optionally by status and TransportRequest");

        return group;
    }
}

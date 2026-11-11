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
            string? search,
            int? skip,
            int? take,
            JobQueries queries,
            JobSummaryEnricher enricher,
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
            // A Job does not store its robot as a column; Fleet's assignments say which Jobs a robot ran. Assignments
            // can outlive a deleted Job (no cross-module FK), so ask for spare ids; the query keeps `limit` real Jobs.
            var offset = Math.Clamp(skip ?? 0, 0, 10_000);
            var jobIds = robotId is { } id ? await fleet.GetRecentJobIdsAsync(id, (offset + limit) * 2, cancellationToken) : null;
            var (items, total) = await queries.ListAsync(parsed, transportRequestId, limit, cancellationToken, jobIds, search, offset);
            return Results.Ok(new { items = await enricher.EnrichAsync(items, cancellationToken), total });
        })
        .RequirePermission(Permissions.JobRead)
        .WithName("ListJobs")
        .WithSummary("List Jobs, optionally by status, TransportRequest, robot (the robot's most recent Jobs) and a search term")
        .WithDescription("Newest first. `search` matches part of the Job number, or the exact Job id. Page with `skip` and `take` (default 50, max 200); `total` counts every Job matching the filters.");

        return group;
    }
}

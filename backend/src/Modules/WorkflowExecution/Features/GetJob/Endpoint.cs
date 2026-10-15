using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.WorkflowExecution.Features.Shared;

namespace WaroTrans.WorkflowExecution.Features.GetJob;

public static class GetJobEndpoint
{
    public static RouteGroupBuilder MapGetJob(this RouteGroupBuilder group)
    {
        group.MapGet("/jobs/{id:guid}", async (
            Guid id,
            JobQueries queries,
            CancellationToken cancellationToken) => Results.Ok(await queries.GetDetailAsync(id, cancellationToken)))
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("GetJob")
        .WithSummary("Job runtime detail: tasks, steps (status, resolved inputs, outputs), containers, progress");

        return group;
    }
}

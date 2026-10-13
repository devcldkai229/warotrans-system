using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Transportation.Features.QueueTransportRequest;

public static class QueueTransportRequestEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/transport-requests/{id:guid}/queue", async (
            Guid id,
            QueueTransportRequestHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(response);
        })
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("QueueTransportRequest")
        .WithSummary("Plan a submitted TransportRequest into Jobs and queue it")
        .WithDescription("Builds the execution snapshot from the persisted Details, plans JobBatchPlans (collect first, deliver after; one batch in V1) and provisions the Job runtime graph. Idempotent: calling again returns the same Jobs. Does not assign Robots or start execution.");
    }
}

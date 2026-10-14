using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Transportation.Features.GetTransportRequest;

public static class GetTransportRequestEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/transport-requests/{id:guid}", async (
            Guid id,
            GetTransportRequestHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(response);
        })
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("GetTransportRequest")
        .WithSummary("Get TransportRequest by id")
        .WithDescription(
            "Returns a TransportRequest with enriched container, storage location and endpoint labels.");
    }
}

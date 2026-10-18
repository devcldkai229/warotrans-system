using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.SetProductStatus;

public static class SetProductStatusEndpoint
{
    public static RouteGroupBuilder MapSetProductStatus(this RouteGroupBuilder group)
    {
        group.MapPost("/products/{id:guid}/status", async (
            Guid id,
            SetProductStatusRequest request,
            SetProductStatusHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(id, request, cancellationToken)))
        .WithName("SetProductStatus")
        .WithSummary("Activate or deactivate a product")
        .WithDescription("An inactive product cannot get new Containers. Existing Containers are not changed.")
        .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        return group;
    }
}

using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.ListInventory;

public static class ListInventoryEndpoint
{
    public static RouteGroupBuilder MapListInventory(this RouteGroupBuilder group)
    {
        group.MapGet("/inventory", async (
            Guid warehouseId,
            string? search,
            int? skip,
            int? take,
            IValidator<ListInventoryRequest> validator,
            ListInventoryHandler handler,
            CancellationToken cancellationToken) =>
        {
            var request = new ListInventoryRequest(warehouseId, search, skip ?? 0, take ?? 100);
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            return Results.Ok(await handler.HandleAsync(request, cancellationToken));
        })
        .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
        .WithName("ListInventory")
        .WithSummary("List inventory stock for a warehouse")
        .WithDescription(
            "Stock rows (product, storage location, shelf level) with the number of Containers. " +
            "Read-only: the numbers change only through the Container lifecycle.");

        return group;
    }
}

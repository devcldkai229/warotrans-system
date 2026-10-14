using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Warehouse.Features.ListWarehouses;

public static class ListWarehousesEndpoint
{
    public static RouteGroupBuilder MapListWarehouses(this RouteGroupBuilder group)
    {
        group.MapGet("/warehouses", async (
            bool? isActive,
            int? skip,
            int? take,
            IValidator<ListWarehousesRequest> validator,
            ListWarehousesHandler handler,
            CancellationToken cancellationToken) =>
        {
            var request = new ListWarehousesRequest(isActive, skip ?? 0, take ?? 50);
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("ListWarehouses")
        .WithSummary("List warehouses")
        .WithDescription("Returns warehouses for Admin selectors. Optionally filter by isActive.");

        return group;
    }
}

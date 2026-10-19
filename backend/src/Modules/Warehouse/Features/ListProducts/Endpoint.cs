using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Warehouse.Features.ListProducts;

public static class ListProductsEndpoint
{
    public static RouteGroupBuilder MapListProducts(this RouteGroupBuilder group)
    {
        group.MapGet("/products", async (
            string? search,
            Guid? categoryId,
            bool? isActive,
            int? skip,
            int? take,
            IValidator<ListProductsRequest> validator,
            ListProductsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var request = new ListProductsRequest(search, categoryId, isActive, skip ?? 0, take ?? 100);
            await validator.ValidateAndThrowAsync(request, cancellationToken);
            return Results.Ok(await handler.HandleAsync(request, cancellationToken));
        })
        .WithName("ListProducts")
        .WithSummary("List products")
        .WithDescription("Product master catalog, ordered by SKU. Filter by category, active flag or a search text.");

        return group;
    }
}

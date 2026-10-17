using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Warehouse.Features.ListProductCategories;

public static class ListProductCategoriesEndpoint
{
    public static RouteGroupBuilder MapListProductCategories(this RouteGroupBuilder group)
    {
        group.MapGet("/product-categories", async (
            ListProductCategoriesHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(cancellationToken)))
        .WithName("ListProductCategories")
        .WithSummary("List product categories")
        .WithDescription("All categories ordered by code.");

        return group;
    }
}

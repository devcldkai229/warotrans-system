using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Warehouse.Features.ResolveProduct;

public static class ResolveProductEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/products/resolve", async (
            [AsParameters] ResolveProductRequest request,
            ResolveProductHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("ResolveProduct")
        .WithSummary("Resolve a product by supplier barcode or search keyword")
        .WithDescription("Resolves an active Product via supplier barcode / SKU, or searches products by keyword.");
    }
}

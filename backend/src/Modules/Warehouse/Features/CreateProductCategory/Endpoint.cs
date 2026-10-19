using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.CreateProductCategory;

public static class CreateProductCategoryEndpoint
{
    public static RouteGroupBuilder MapCreateProductCategory(this RouteGroupBuilder group)
    {
        group.MapPost("/product-categories", async (
            CreateProductCategoryRequest request,
            CreateProductCategoryHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Created($"/api/warehouse/product-categories/{response.Id}", response);
        })
        .WithName("CreateProductCategory")
        .WithSummary("Create a product category")
        .WithDescription("Adds a category products can be grouped under. The code must be unique.")
        .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        return group;
    }
}

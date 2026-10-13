using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Identity.Features.ListAccounts;

internal static class ListAccountsEndpoint
{
    public static void MapListAccounts(this IEndpointRouteBuilder group) =>
        group.MapGet("/accounts", async (ListAccountsHandler handler, CancellationToken cancellationToken) =>
                TypedResults.Ok(await handler.HandleAsync(cancellationToken)))
            .RequireAuthorization(AuthorizationPolicies.AdminOnly)
            .WithName("ListAccounts")
            .Produces<ListAccountsResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);
}

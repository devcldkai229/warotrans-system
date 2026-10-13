using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Features.Shared;

namespace WaroTrans.Identity.Features.GetCurrentAccount;

internal static class GetCurrentAccountEndpoint
{
    public static void MapGetCurrentAccount(this IEndpointRouteBuilder group) =>
        group.MapGet("/me", async (GetCurrentAccountHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.HandleAsync(cancellationToken);
                return result.IsSuccess
                    ? TypedResults.Ok(result.Value)
                    : result.Error.ToProblem();
            })
            .RequireAuthorization(AuthorizationPolicies.StaffOrAdmin)
            .WithName("GetCurrentAccount")
            .Produces<AccountResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized);
}

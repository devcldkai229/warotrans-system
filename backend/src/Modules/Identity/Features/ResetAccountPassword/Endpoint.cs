using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Features.CreateAccount;
using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Identity.Features.ResetAccountPassword;

internal static class ResetAccountPasswordEndpoint
{
    public static void MapResetAccountPassword(this IEndpointRouteBuilder group) =>
        group.MapPost("/accounts/{id:guid}/reset-password", async (
                Guid id,
                ResetAccountPasswordHandler handler,
                HttpContext httpContext,
                CancellationToken cancellationToken) =>
            {
                var result = await handler.HandleAsync(id, cancellationToken);
                if (!result.IsSuccess)
                {
                    return result.Error.ToProblem();
                }

                // The body carries a one-time password: it must not end up in a browser or proxy cache.
                httpContext.Response.Headers.CacheControl = "no-store";
                return TypedResults.Ok(result.Value);
            })
            .RequirePermission(Permissions.UserManage)
            .Audited("account.password_reset", "ACCOUNT", "id")
            .WithName("ResetAccountPassword")
            .Produces<CreateAccountResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);
}

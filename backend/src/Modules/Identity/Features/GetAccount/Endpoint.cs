using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Features.Shared;
using WaroTrans.Identity.Persistence;

namespace WaroTrans.Identity.Features.GetAccount;

/// <summary>The target of the Location header returned by CreateAccount.</summary>
internal static class GetAccountEndpoint
{
    public static void MapGetAccount(this IEndpointRouteBuilder group) =>
        group.MapGet("/accounts/{id:guid}", async (Guid id, IdentityDbContext dbContext, CancellationToken cancellationToken) =>
            {
                var account = await dbContext.Accounts
                    .AsNoTracking()
                    .SingleOrDefaultAsync(a => a.Id == id, cancellationToken);

                return account is null
                    ? IdentityErrors.TargetAccountNotFound.ToProblem()
                    : TypedResults.Ok(AccountResponse.From(account));
            })
            .RequirePermission(Permissions.UserManage)
            .WithName("GetAccount")
            .Produces<AccountResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);
}

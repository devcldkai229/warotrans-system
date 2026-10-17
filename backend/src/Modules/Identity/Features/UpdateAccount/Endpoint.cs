using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Features.Shared;

namespace WaroTrans.Identity.Features.UpdateAccount;

internal static class UpdateAccountEndpoint
{
    public static void MapUpdateAccount(this IEndpointRouteBuilder group) =>
        group.MapPut("/accounts/{id:guid}", async (
                Guid id,
                UpdateAccountRequest request,
                IValidator<UpdateAccountRequest> validator,
                UpdateAccountHandler handler,
                CancellationToken cancellationToken) =>
            {
                var validation = await validator.ValidateAsync(request, cancellationToken);
                if (!validation.IsValid)
                {
                    return validation.ToValidationProblem();
                }

                var result = await handler.HandleAsync(id, request, cancellationToken);
                return result.IsSuccess ? TypedResults.Ok(result.Value) : result.Error.ToProblem();
            })
            .RequireAuthorization(AuthorizationPolicies.AdminOnly)
            .WithName("UpdateAccount")
            .Produces<AccountResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);
}

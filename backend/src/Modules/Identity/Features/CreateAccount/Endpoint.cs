using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Results;

namespace WaroTrans.Identity.Features.CreateAccount;

internal static class CreateAccountEndpoint
{
    public static void MapCreateAccount(this IEndpointRouteBuilder group) =>
        group.MapPost("/accounts", async (
                CreateAccountRequest request,
                IValidator<CreateAccountRequest> validator,
                CreateAccountHandler handler,
                HttpContext httpContext,
                CancellationToken cancellationToken) =>
            {
                var validation = await validator.ValidateAsync(request, cancellationToken);
                if (!validation.IsValid)
                {
                    return validation.ToValidationProblem();
                }

                var result = await handler.HandleAsync(request, cancellationToken);
                if (!result.IsSuccess)
                {
                    return result.Error.ToProblem();
                }

                // The body carries a one-time password: it must not end up in a browser or proxy cache.
                httpContext.Response.Headers.CacheControl = "no-store";
                return TypedResults.Created($"/api/identity/accounts/{result.Value.Account.Id}", result.Value);
            })
            .RequireAuthorization(AuthorizationPolicies.AdminOnly)
            .WithName("CreateAccount")
            .Produces<CreateAccountResponse>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);
}

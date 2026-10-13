using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Features.Shared;

namespace WaroTrans.Identity.Features.Login;

internal static class LoginEndpoint
{
    public static void MapLogin(this IEndpointRouteBuilder group) =>
        group.MapPost("/login", async (
                LoginRequest request,
                IValidator<LoginRequest> validator,
                LoginHandler handler,
                HttpContext httpContext,
                CancellationToken cancellationToken) =>
            {
                var validation = await validator.ValidateAsync(request, cancellationToken);
                if (!validation.IsValid)
                {
                    return validation.ToValidationProblem();
                }

                var result = await handler.HandleAsync(request, cancellationToken);
                return result.IsSuccess
                    ? result.Value.ToHttpResult(request.UseCookie, httpContext)
                    : result.Error.ToProblem();
            })
            .AllowAnonymous()
            .WithName("Login")
            .Produces<SessionResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);
}

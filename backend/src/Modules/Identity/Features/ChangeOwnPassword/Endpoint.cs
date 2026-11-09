using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Features.Shared;

namespace WaroTrans.Identity.Features.ChangeOwnPassword;

internal static class ChangeOwnPasswordEndpoint
{
    public static void MapChangeOwnPassword(this IEndpointRouteBuilder group) =>
        group.MapPost("/me/change-password", async (
                ChangeOwnPasswordRequest request,
                IValidator<ChangeOwnPasswordRequest> validator,
                ChangeOwnPasswordHandler handler,
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
            .RequireAuthorization()
            .AllowWhilePasswordChangeRequired()
            .WithName("ChangeOwnPassword")
            .Produces<SessionResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);
}

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Features.Shared;

namespace WaroTrans.Identity.Features.RefreshSession;

internal static class RefreshSessionEndpoint
{
    public static void MapRefreshSession(this IEndpointRouteBuilder group) =>
        group.MapPost("/refresh", async (
                RefreshSessionRequest? request,
                RefreshSessionHandler handler,
                HttpContext httpContext,
                CancellationToken cancellationToken) =>
            {
                // The reply uses the same transport the token arrived on: body for mobile, cookie for the browser.
                var bodyToken = request?.RefreshToken;
                var useCookie = string.IsNullOrWhiteSpace(bodyToken);
                var refreshToken = useCookie ? RefreshTokenCookie.Read(httpContext) : bodyToken;

                if (string.IsNullOrWhiteSpace(refreshToken))
                {
                    return IdentityErrors.InvalidRefreshToken.ToProblem();
                }

                var result = await handler.HandleAsync(refreshToken, cancellationToken);
                if (result.IsSuccess)
                {
                    return result.Value.ToHttpResult(useCookie, httpContext);
                }

                if (useCookie)
                {
                    RefreshTokenCookie.Clear(httpContext);
                }

                return result.Error.ToProblem();
            })
            // The refresh token is the credential here; the access token has usually expired by the time this is called.
            .AllowAnonymous()
            .WithName("RefreshSession")
            .Produces<SessionResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);
}

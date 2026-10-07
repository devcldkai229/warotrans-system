using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.Identity.Features.Shared;

namespace WaroTrans.Identity.Features.Logout;

internal static class LogoutEndpoint
{
    public static void MapLogout(this IEndpointRouteBuilder group) =>
        group.MapPost("/logout", async (
                LogoutRequest? request,
                LogoutHandler handler,
                HttpContext httpContext,
                CancellationToken cancellationToken) =>
            {
                var refreshToken = string.IsNullOrWhiteSpace(request?.RefreshToken)
                    ? RefreshTokenCookie.Read(httpContext)
                    : request.RefreshToken;

                if (!string.IsNullOrWhiteSpace(refreshToken))
                {
                    await handler.HandleAsync(refreshToken, cancellationToken);
                }

                RefreshTokenCookie.Clear(httpContext);
                return TypedResults.NoContent();
            })
            // Must work with an expired access token, otherwise a user could not sign out after a long idle.
            .AllowAnonymous()
            .WithName("Logout")
            .Produces(StatusCodes.Status204NoContent);
}

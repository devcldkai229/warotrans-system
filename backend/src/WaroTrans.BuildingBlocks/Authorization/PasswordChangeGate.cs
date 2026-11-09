using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using WaroTrans.BuildingBlocks.Results;

namespace WaroTrans.BuildingBlocks.Authorization;

/// <summary>Endpoint metadata: still reachable with a token that says the password must be changed first.</summary>
public sealed class AllowWhilePasswordChangeRequiredAttribute : Attribute;

public static class PasswordChangeGate
{
    public static readonly Error PasswordChangeRequired = Error.Forbidden(
        "password_change_required",
        "Change the temporary password before using the system.");

    public static TBuilder AllowWhilePasswordChangeRequired<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder =>
        builder.WithMetadata(new AllowWhilePasswordChangeRequiredAttribute());

    public static bool IsPasswordChangeRequired(this System.Security.Claims.ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true
        && string.Equals(user.FindFirst(AppClaimTypes.PasswordChangeRequired)?.Value, "true", StringComparison.Ordinal);

    /// <summary>
    /// After authentication: a signed-in user holding a temporary password may only reach endpoints marked
    /// <see cref="AllowWhilePasswordChangeRequiredAttribute"/> (who am I, change password, sign out).
    /// Anonymous endpoints are unaffected.
    /// </summary>
    public static IApplicationBuilder UsePasswordChangeGate(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            if (context.User.IsPasswordChangeRequired()
                && context.GetEndpoint() is { } endpoint
                && endpoint.Metadata.GetMetadata<AllowWhilePasswordChangeRequiredAttribute>() is null
                && endpoint.Metadata.GetMetadata<Microsoft.AspNetCore.Authorization.IAllowAnonymous>() is null)
            {
                await PasswordChangeRequired.ToProblem().ExecuteAsync(context);
                return;
            }

            await next(context);
        });
}

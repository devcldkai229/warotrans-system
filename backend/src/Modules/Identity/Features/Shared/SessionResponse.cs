using Microsoft.AspNetCore.Http;
using WaroTrans.Identity.Entities;
using WaroTrans.Identity.Security;

namespace WaroTrans.Identity.Features.Shared;

/// <summary>What Login and RefreshSession hand back to their endpoints: a fresh token pair for one account.</summary>
internal sealed record IssuedSession(
    IssuedAccessToken AccessToken,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAt,
    AccountResponse Account)
{
    public static IssuedSession From(Account account, IssuedAccessToken accessToken, IssuedRefreshToken refreshToken) =>
        new(accessToken, refreshToken.RawToken, refreshToken.Entity.ExpiresAt, AccountResponse.From(account));
}

/// <summary>
/// Response body of Login and RefreshSession. <see cref="RefreshToken"/> is null when it travels in the HttpOnly cookie instead.
/// </summary>
internal sealed record SessionResponse(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    string? RefreshToken,
    AccountResponse Account);

internal static class SessionHttp
{
    public static IResult ToHttpResult(this IssuedSession session, bool useCookie, HttpContext httpContext)
    {
        if (useCookie)
        {
            RefreshTokenCookie.Write(httpContext, session.RefreshToken, session.RefreshTokenExpiresAt);
        }

        return TypedResults.Ok(new SessionResponse(
            session.AccessToken.Token,
            session.AccessToken.ExpiresAt,
            useCookie ? null : session.RefreshToken,
            session.Account));
    }
}

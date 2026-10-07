using Microsoft.AspNetCore.Http;

namespace WaroTrans.Identity.Features.Shared;

/// <summary>
/// Browser transport for the refresh token. HttpOnly keeps it away from page scripts, and the path limits it to the
/// Identity endpoints so it is not attached to every API call.
/// </summary>
internal static class RefreshTokenCookie
{
    private const string Name = "warotrans_refresh";
    private const string Path = "/api/identity";

    public static string? Read(HttpContext httpContext) =>
        httpContext.Request.Cookies[Name];

    public static void Write(HttpContext httpContext, string refreshToken, DateTimeOffset expiresAt)
    {
        var options = BuildOptions(httpContext);
        options.Expires = expiresAt;
        httpContext.Response.Cookies.Append(Name, refreshToken, options);
    }

    public static void Clear(HttpContext httpContext) =>
        httpContext.Response.Cookies.Delete(Name, BuildOptions(httpContext));

    private static CookieOptions BuildOptions(HttpContext httpContext) => new()
    {
        HttpOnly = true,
        // Local development runs on plain http://localhost; everywhere else the API is served over HTTPS.
        Secure = httpContext.Request.IsHttps,
        SameSite = SameSiteMode.Strict,
        Path = Path
    };
}

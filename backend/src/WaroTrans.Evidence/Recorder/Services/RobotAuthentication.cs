using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Persistence;

namespace WaroTrans.Evidence.Recorder.Services;

/// <summary>
/// Robots sign in with <c>Authorization: Robot RBT-002.&lt;token&gt;</c>. The token was shown once when an admin issued
/// it; only its SHA-256 is stored. A revoked credential stops working within <see cref="CacheFor"/>.
/// </summary>
internal sealed class RobotAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    EvidenceDbContext db,
    IMemoryCache cache,
    TimeProvider clock) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Robot";
    public const string RobotCodeClaim = "robot_code";
    public const string Policy = "evidence-robot";
    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(60);

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith(SchemeName + " ", StringComparison.Ordinal))
        {
            return AuthenticateResult.NoResult();
        }

        var value = header[(SchemeName.Length + 1)..].Trim();
        var dot = value.IndexOf('.');
        if (dot <= 0 || dot == value.Length - 1)
        {
            return AuthenticateResult.Fail("Malformed robot credential.");
        }

        var code = value[..dot];
        var hash = Sha256Hex(value[(dot + 1)..]);
        var cacheKey = ("robot-credential", hash);
        if (!cache.TryGetValue(cacheKey, out string? knownCode))
        {
            var credential = await db.RobotCredentials
                .Where(c => c.TokenSha256 == hash && c.RevokedAtUtc == null)
                .FirstOrDefaultAsync(Context.RequestAborted);
            knownCode = credential?.RobotCode;
            if (credential is not null)
            {
                credential.LastUsedAtUtc = clock.GetUtcNow();
                await db.SaveChangesAsync(Context.RequestAborted);
            }

            cache.Set(cacheKey, knownCode, CacheFor);
        }

        if (knownCode is null || !string.Equals(knownCode, code, StringComparison.Ordinal))
        {
            return AuthenticateResult.Fail("Unknown or revoked robot credential.");
        }

        var identity = new ClaimsIdentity([new Claim(RobotCodeClaim, code)], SchemeName);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }

    public static string Sha256Hex(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

internal static class RobotPrincipal
{
    /// <summary>The robot the caller signed in as (set by <see cref="RobotAuthenticationHandler"/>).</summary>
    public static string? RobotCode(this ClaimsPrincipal user) => user.FindFirstValue(RobotAuthenticationHandler.RobotCodeClaim);
}

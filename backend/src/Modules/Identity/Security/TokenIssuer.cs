using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Options;
using WaroTrans.Identity.Entities;

namespace WaroTrans.Identity.Security;

internal sealed record IssuedAccessToken(string Token, DateTimeOffset ExpiresAt);

internal sealed record IssuedRefreshToken(RefreshToken Entity, string RawToken);

internal sealed class TokenIssuer(IOptions<JwtOptions> options, TimeProvider timeProvider)
{
    private const int RefreshTokenBytes = 32;

    private static readonly JsonWebTokenHandler Handler = new();

    public IssuedAccessToken CreateAccessToken(Account account)
    {
        var jwt = options.Value;
        var now = timeProvider.GetUtcNow();
        var expiresAt = now.AddMinutes(jwt.AccessTokenMinutes);

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = jwt.Issuer,
            Audience = jwt.Audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            Claims = new Dictionary<string, object>
            {
                [AppClaimTypes.Subject] = account.Id.ToString(),
                [AppClaimTypes.Name] = account.Username,
                [AppClaimTypes.Role] = account.Role.ToString(),
                [JwtRegisteredClaimNames.Jti] = Guid.NewGuid().ToString()
            },
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
                SecurityAlgorithms.HmacSha256)
        };

        return new IssuedAccessToken(Handler.CreateToken(descriptor), expiresAt);
    }

    /// <summary>
    /// Creates an untracked refresh token row and the raw value to hand to the client. The raw value cannot be recovered later.
    /// </summary>
    public IssuedRefreshToken CreateRefreshToken(Guid accountId, Guid familyId)
    {
        var now = timeProvider.GetUtcNow();
        var rawToken = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(RefreshTokenBytes));

        var entity = new RefreshToken
        {
            Id = Guid.NewGuid(),
            AccountId = accountId,
            TokenHash = HashRefreshToken(rawToken),
            FamilyId = familyId,
            CreatedAt = now,
            ExpiresAt = now.AddDays(options.Value.RefreshTokenDays)
        };

        return new IssuedRefreshToken(entity, rawToken);
    }

    // The token is 256 random bits, so a plain SHA-256 is enough; a slow password hash would add nothing.
    public static string HashRefreshToken(string rawToken) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
}

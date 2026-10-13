using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.Identity.Persistence;
using WaroTrans.Identity.Security;

namespace WaroTrans.Identity.Features.Logout;

internal sealed class LogoutHandler(
    IdentityDbContext dbContext,
    TimeProvider timeProvider,
    ILogger<LogoutHandler> logger)
{
    /// <summary>
    /// Ends the device session the token belongs to. Unknown or already revoked tokens are ignored: the caller is signed out either way.
    /// </summary>
    public async Task HandleAsync(string rawRefreshToken, CancellationToken cancellationToken)
    {
        var tokenHash = TokenIssuer.HashRefreshToken(rawRefreshToken);
        var token = await dbContext.RefreshTokens
            .AsNoTracking()
            .Where(t => t.TokenHash == tokenHash)
            .Select(t => new { t.AccountId, t.FamilyId })
            .SingleOrDefaultAsync(cancellationToken);

        if (token is null)
        {
            return;
        }

        await dbContext.RevokeFamilyAsync(token.FamilyId, timeProvider.GetUtcNow(), cancellationToken);
        logger.LogInformation("Account {AccountId} signed out", token.AccountId);
    }
}

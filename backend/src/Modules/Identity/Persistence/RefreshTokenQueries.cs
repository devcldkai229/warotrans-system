using Microsoft.EntityFrameworkCore;

namespace WaroTrans.Identity.Persistence;

internal static class RefreshTokenQueries
{
    /// <summary>Ends one signed-in device: every still-valid token of the rotation chain is revoked.</summary>
    public static Task<int> RevokeFamilyAsync(
        this IdentityDbContext dbContext,
        Guid familyId,
        DateTimeOffset now,
        CancellationToken cancellationToken) =>
        dbContext.RefreshTokens
            .Where(t => t.FamilyId == familyId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), cancellationToken);

    /// <summary>
    /// Revoked tokens are kept until they expire so a replayed one can still be recognised; expired ones are useless.
    /// </summary>
    public static Task<int> DeleteExpiredRefreshTokensAsync(
        this IdentityDbContext dbContext,
        Guid accountId,
        DateTimeOffset now,
        CancellationToken cancellationToken) =>
        dbContext.RefreshTokens
            .Where(t => t.AccountId == accountId && t.ExpiresAt <= now)
            .ExecuteDeleteAsync(cancellationToken);
}

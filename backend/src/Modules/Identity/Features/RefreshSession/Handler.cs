using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Enums;
using WaroTrans.Identity.Features.Shared;
using WaroTrans.Identity.Persistence;
using WaroTrans.Identity.Security;

namespace WaroTrans.Identity.Features.RefreshSession;

internal sealed class RefreshSessionHandler(
    IdentityDbContext dbContext,
    TokenIssuer tokenIssuer,
    TimeProvider timeProvider,
    ILogger<RefreshSessionHandler> logger)
{
    public async Task<Result<IssuedSession>> HandleAsync(string rawRefreshToken, CancellationToken cancellationToken)
    {
        var tokenHash = TokenIssuer.HashRefreshToken(rawRefreshToken);
        var current = await dbContext.RefreshTokens
            .AsNoTracking()
            .Include(t => t.Account)
            .SingleOrDefaultAsync(t => t.TokenHash == tokenHash, cancellationToken);

        if (current is null)
        {
            return Result.Failure<IssuedSession>(IdentityErrors.InvalidRefreshToken);
        }

        var now = timeProvider.GetUtcNow();

        // A token is rotated on every use, so seeing a revoked one again means it was copied.
        // Whoever holds the newer token cannot be told apart from the thief, so the whole family ends.
        if (current.RevokedAt is not null)
        {
            await dbContext.RevokeFamilyAsync(current.FamilyId, now, cancellationToken);
            logger.LogWarning(
                "Revoked refresh token replayed for account {AccountId}; token family {FamilyId} revoked",
                current.AccountId,
                current.FamilyId);
            return Result.Failure<IssuedSession>(IdentityErrors.InvalidRefreshToken);
        }

        if (current.ExpiresAt <= now)
        {
            return Result.Failure<IssuedSession>(IdentityErrors.InvalidRefreshToken);
        }

        if (current.Account.Status != AccountStatus.ACTIVE)
        {
            await dbContext.RevokeFamilyAsync(current.FamilyId, now, cancellationToken);
            return Result.Failure<IssuedSession>(IdentityErrors.AccountNotActive(current.Account.Status));
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        // Conditional update instead of load-then-save: of two concurrent requests with the same token only one wins.
        var rotated = await dbContext.RefreshTokens
            .Where(t => t.Id == current.Id && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), cancellationToken);

        if (rotated == 0)
        {
            await dbContext.RevokeFamilyAsync(current.FamilyId, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            logger.LogWarning(
                "Refresh token used twice concurrently for account {AccountId}; token family {FamilyId} revoked",
                current.AccountId,
                current.FamilyId);
            return Result.Failure<IssuedSession>(IdentityErrors.InvalidRefreshToken);
        }

        await dbContext.DeleteExpiredRefreshTokensAsync(current.AccountId, now, cancellationToken);

        var next = tokenIssuer.CreateRefreshToken(current.AccountId, current.FamilyId);
        dbContext.RefreshTokens.Add(next.Entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Result.Success(IssuedSession.From(current.Account, tokenIssuer.CreateAccessToken(current.Account), next));
    }
}

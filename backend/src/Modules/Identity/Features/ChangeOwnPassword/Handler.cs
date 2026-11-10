using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Entities;
using WaroTrans.Identity.Enums;
using WaroTrans.Identity.Features.Shared;
using WaroTrans.Identity.Persistence;
using WaroTrans.Identity.Security;

namespace WaroTrans.Identity.Features.ChangeOwnPassword;

internal sealed class ChangeOwnPasswordHandler(
    IdentityDbContext dbContext,
    IPasswordHasher<Account> passwordHasher,
    TokenIssuer tokenIssuer,
    TimeProvider timeProvider,
    ICurrentUser currentUser,
    IAuditTrail audit,
    ILogger<ChangeOwnPasswordHandler> logger)
{
    /// <summary>
    /// Replaces the caller's password, ends every session of the account (other devices must sign in again with
    /// the new password) and returns a fresh session for this device, without the "must change password" mark.
    /// </summary>
    public async Task<Result<IssuedSession>> HandleAsync(ChangeOwnPasswordRequest request, CancellationToken cancellationToken)
    {
        if (currentUser.AccountId is not { } accountId)
        {
            return Result.Failure<IssuedSession>(IdentityErrors.AccountNotFound);
        }

        var account = await dbContext.Accounts.SingleOrDefaultAsync(a => a.Id == accountId, cancellationToken);
        if (account is null)
        {
            return Result.Failure<IssuedSession>(IdentityErrors.AccountNotFound);
        }

        if (account.Status != AccountStatus.ACTIVE)
        {
            return Result.Failure<IssuedSession>(IdentityErrors.AccountNotActive(account.Status));
        }

        if (passwordHasher.VerifyHashedPassword(account, account.PasswordHash, request.CurrentPassword)
            == PasswordVerificationResult.Failed)
        {
            logger.LogWarning("Account {AccountId} failed to change its password: wrong current password", account.Id);
            await audit.RecordAsync(new AuditEntry("account.password_change_failed", "ACCOUNT", account.Id), cancellationToken);
            return Result.Failure<IssuedSession>(IdentityErrors.CurrentPasswordIncorrect);
        }

        if (PasswordPolicy.ContainsUsername(request.NewPassword, account.Username))
        {
            return Result.Failure<IssuedSession>(IdentityErrors.PasswordContainsUsername);
        }

        var mustChangeBefore = account.MustChangePassword;
        var now = timeProvider.GetUtcNow();
        account.PasswordHash = passwordHasher.HashPassword(account, request.NewPassword);
        account.MustChangePassword = false;
        account.PasswordChangedAt = now;
        account.UpdatedAt = now;

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await dbContext.RevokeAllForAccountAsync(account.Id, now, cancellationToken);
        var refreshToken = tokenIssuer.CreateRefreshToken(account.Id, familyId: Guid.NewGuid());
        dbContext.RefreshTokens.Add(refreshToken.Entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        logger.LogInformation("Account {AccountId} changed its password; all other sessions revoked", account.Id);
        await audit.RecordAsync(
            new AuditEntry("account.password_changed", "ACCOUNT", account.Id,
                Context: new Dictionary<string, object?> { ["wasTemporary"] = mustChangeBefore }),
            cancellationToken);

        return Result.Success(IssuedSession.From(account, tokenIssuer.CreateAccessToken(account), refreshToken));
    }
}

using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Entities;
using WaroTrans.Identity.Features.CreateAccount;
using WaroTrans.Identity.Features.Shared;
using WaroTrans.Identity.Persistence;
using WaroTrans.Identity.Security;

namespace WaroTrans.Identity.Features.ResetAccountPassword;

internal sealed class ResetAccountPasswordHandler(
    IdentityDbContext dbContext,
    IPasswordHasher<Account> passwordHasher,
    TimeProvider timeProvider,
    ICurrentUser currentUser,
    ILogger<ResetAccountPasswordHandler> logger)
{
    /// <summary>
    /// Gives the account a new temporary password (returned once, never logged), marks it "must change" and ends
    /// every open session, so whoever knew the old password is signed out.
    /// </summary>
    public async Task<Result<CreateAccountResponse>> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        if (id == currentUser.AccountId)
        {
            return Result.Failure<CreateAccountResponse>(IdentityErrors.CannotResetOwnPassword);
        }

        var account = await dbContext.Accounts.SingleOrDefaultAsync(a => a.Id == id, cancellationToken);
        if (account is null)
        {
            return Result.Failure<CreateAccountResponse>(IdentityErrors.TargetAccountNotFound);
        }

        var now = timeProvider.GetUtcNow();
        var temporaryPassword = TemporaryPassword.Generate();
        account.PasswordHash = passwordHasher.HashPassword(account, temporaryPassword);
        account.MustChangePassword = true;
        account.PasswordChangedAt = now;
        account.UpdatedAt = now;

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await dbContext.RevokeAllForAccountAsync(account.Id, now, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        logger.LogInformation(
            "Password of account {AccountId} reset by {ResetBy}; sessions revoked",
            account.Id,
            currentUser.AccountId);

        return Result.Success(new CreateAccountResponse(AccountResponse.From(account), temporaryPassword));
    }
}

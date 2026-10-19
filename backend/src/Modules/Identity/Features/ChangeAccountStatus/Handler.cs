using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Enums;
using WaroTrans.Identity.Features.Shared;
using WaroTrans.Identity.Persistence;

namespace WaroTrans.Identity.Features.ChangeAccountStatus;

internal sealed class ChangeAccountStatusHandler(
    IdentityDbContext dbContext,
    TimeProvider timeProvider,
    ICurrentUser currentUser,
    ILogger<ChangeAccountStatusHandler> logger)
{
    public async Task<Result<AccountResponse>> HandleAsync(Guid id, ChangeAccountStatusRequest request, CancellationToken cancellationToken)
    {
        var account = await dbContext.Accounts.SingleOrDefaultAsync(a => a.Id == id, cancellationToken);
        if (account is null)
        {
            return Result.Failure<AccountResponse>(IdentityErrors.TargetAccountNotFound);
        }

        AccountRules.TryParseStatus(request.Status, out var status);
        if (status == account.Status)
        {
            return Result.Success(AccountResponse.From(account));
        }

        var deactivating = status == AccountStatus.INACTIVE;
        if (deactivating)
        {
            if (account.Id == currentUser.AccountId)
            {
                return Result.Failure<AccountResponse>(IdentityErrors.CannotChangeOwnAccess);
            }

            if (account.Role == AccountRole.ADMIN
                && account.Status == AccountStatus.ACTIVE
                && !await dbContext.HasOtherActiveAdminAsync(account.Id, cancellationToken))
            {
                return Result.Failure<AccountResponse>(IdentityErrors.LastActiveAdmin);
            }
        }

        var now = timeProvider.GetUtcNow();
        account.Status = status;
        account.UpdatedAt = now;

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (deactivating)
        {
            // Sign-in already refuses an inactive account; this also ends the sessions that are open now.
            await dbContext.RevokeAllForAccountAsync(account.Id, now, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        logger.LogInformation(
            "Account {AccountId} set to {Status} by {ChangedBy}",
            account.Id,
            status,
            currentUser.AccountId);

        return Result.Success(AccountResponse.From(account));
    }
}

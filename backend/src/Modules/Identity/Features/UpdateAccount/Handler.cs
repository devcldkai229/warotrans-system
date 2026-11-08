using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Enums;
using WaroTrans.Identity.Features.Shared;
using WaroTrans.Identity.Persistence;

namespace WaroTrans.Identity.Features.UpdateAccount;

internal sealed class UpdateAccountHandler(
    IdentityDbContext dbContext,
    TimeProvider timeProvider,
    ICurrentUser currentUser,
    IAuditTrail audit,
    ILogger<UpdateAccountHandler> logger)
{
    public async Task<Result<AccountResponse>> HandleAsync(Guid id, UpdateAccountRequest request, CancellationToken cancellationToken)
    {
        var account = await dbContext.Accounts.SingleOrDefaultAsync(a => a.Id == id, cancellationToken);
        if (account is null)
        {
            return Result.Failure<AccountResponse>(IdentityErrors.TargetAccountNotFound);
        }

        AccountRules.TryParseRole(request.Role, out var role);
        var email = AccountRules.NormalizeEmail(request.Email);
        var roleChanges = role != account.Role;

        if (roleChanges)
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

        if (!string.Equals(account.Email, email, StringComparison.OrdinalIgnoreCase)
            && await dbContext.Accounts.AnyAsync(a => a.Id != account.Id && a.Email.ToLower() == email, cancellationToken))
        {
            return Result.Failure<AccountResponse>(IdentityErrors.EmailTaken);
        }

        var before = new Dictionary<string, object?>
        {
            ["email"] = account.Email, ["fullName"] = account.FullName, ["role"] = account.Role.ToString()
        };
        var now = timeProvider.GetUtcNow();
        account.Email = email;
        account.FullName = request.FullName.Trim();
        account.Role = role;
        account.UpdatedAt = now;

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (AccountRules.UniqueViolationConstraint(exception) is not null)
        {
            return Result.Failure<AccountResponse>(IdentityErrors.EmailTaken);
        }

        if (roleChanges && account.Role != AccountRole.TECHNICIAN)
        {
            // A robot scope only means something for a Technician; do not let it come back with a later promotion.
            await dbContext.TechnicianRobotScopes.Where(s => s.AccountId == account.Id).ExecuteDeleteAsync(cancellationToken);
        }

        if (roleChanges)
        {
            // The access token carries the old role for up to its lifetime; ending the sessions makes the next
            // refresh fail, so the person signs in again with the new role.
            await dbContext.RevokeAllForAccountAsync(account.Id, now, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        await audit.RecordAsync(
            new AuditEntry(
                roleChanges ? "account.role_changed" : "account.updated",
                "ACCOUNT",
                account.Id,
                Before: before,
                After: new Dictionary<string, object?>
                {
                    ["email"] = account.Email, ["fullName"] = account.FullName, ["role"] = account.Role.ToString()
                }),
            cancellationToken);

        logger.LogInformation(
            "Account {AccountId} updated by {UpdatedBy} (role changed: {RoleChanged})",
            account.Id,
            currentUser.AccountId,
            roleChanges);

        return Result.Success(AccountResponse.From(account));
    }
}

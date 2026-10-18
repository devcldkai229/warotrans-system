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

namespace WaroTrans.Identity.Features.CreateAccount;

internal sealed class CreateAccountHandler(
    IdentityDbContext dbContext,
    IPasswordHasher<Account> passwordHasher,
    TimeProvider timeProvider,
    ICurrentUser currentUser,
    ILogger<CreateAccountHandler> logger)
{
    public async Task<Result<CreateAccountResponse>> HandleAsync(CreateAccountRequest request, CancellationToken cancellationToken)
    {
        var username = request.Username.Trim();
        var email = AccountRules.NormalizeEmail(request.Email);

        if (await dbContext.Accounts.AnyAsync(a => a.Username == username, cancellationToken))
        {
            return Result.Failure<CreateAccountResponse>(IdentityErrors.UsernameTaken);
        }

        if (await dbContext.Accounts.AnyAsync(a => a.Email.ToLower() == email, cancellationToken))
        {
            return Result.Failure<CreateAccountResponse>(IdentityErrors.EmailTaken);
        }

        AccountRules.TryParseRole(request.Role, out var role);
        var now = timeProvider.GetUtcNow();
        var account = new Account
        {
            Id = Guid.NewGuid(),
            Username = username,
            Email = email,
            FullName = request.FullName.Trim(),
            Role = role,
            Status = AccountStatus.ACTIVE,
            CreatedAt = now,
            UpdatedAt = now
        };

        var temporaryPassword = TemporaryPassword.Generate();
        account.PasswordHash = passwordHasher.HashPassword(account, temporaryPassword);

        dbContext.Accounts.Add(account);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (AccountRules.UniqueViolationConstraint(exception) is { } constraint)
        {
            // Two Admins creating the same person at once: the pre-checks above both passed.
            return Result.Failure<CreateAccountResponse>(
                constraint.Contains("email", StringComparison.OrdinalIgnoreCase)
                    ? IdentityErrors.EmailTaken
                    : IdentityErrors.UsernameTaken);
        }

        logger.LogInformation(
            "Account {AccountId} ({Role}) created by {CreatedBy}",
            account.Id,
            account.Role,
            currentUser.AccountId);

        return Result.Success(new CreateAccountResponse(AccountResponse.From(account), temporaryPassword));
    }
}

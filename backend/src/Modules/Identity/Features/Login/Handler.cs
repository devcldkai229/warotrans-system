using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Entities;
using WaroTrans.Identity.Enums;
using WaroTrans.Identity.Features.Shared;
using WaroTrans.Identity.Persistence;
using WaroTrans.Identity.Security;

namespace WaroTrans.Identity.Features.Login;

internal sealed class LoginHandler(
    IdentityDbContext dbContext,
    IPasswordHasher<Account> passwordHasher,
    TokenIssuer tokenIssuer,
    TimeProvider timeProvider,
    ILogger<LoginHandler> logger)
{
    // Verified when the username is unknown, so that case costs the same time as a wrong password.
    private static readonly Account UnknownAccount = new();
    private static readonly string UnknownAccountPasswordHash =
        new PasswordHasher<Account>().HashPassword(UnknownAccount, Guid.NewGuid().ToString());

    public async Task<Result<IssuedSession>> HandleAsync(LoginRequest request, CancellationToken cancellationToken)
    {
        var username = request.Username.Trim();
        var account = await dbContext.Accounts
            .SingleOrDefaultAsync(a => a.Username == username, cancellationToken);

        if (account is null)
        {
            passwordHasher.VerifyHashedPassword(UnknownAccount, UnknownAccountPasswordHash, request.Password);
            return Result.Failure<IssuedSession>(IdentityErrors.InvalidCredentials);
        }

        var verification = passwordHasher.VerifyHashedPassword(account, account.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            return Result.Failure<IssuedSession>(IdentityErrors.InvalidCredentials);
        }

        // Checked only after the password matched, so the account state is not revealed to someone guessing usernames.
        if (account.Status != AccountStatus.ACTIVE)
        {
            return Result.Failure<IssuedSession>(IdentityErrors.AccountNotActive(account.Status));
        }

        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            account.PasswordHash = passwordHasher.HashPassword(account, request.Password);
        }

        var now = timeProvider.GetUtcNow();
        account.LastLoginAt = now;

        await dbContext.DeleteExpiredRefreshTokensAsync(account.Id, now, cancellationToken);

        // Each login starts a new token family: one family per signed-in device.
        var refreshToken = tokenIssuer.CreateRefreshToken(account.Id, familyId: Guid.NewGuid());
        dbContext.RefreshTokens.Add(refreshToken.Entity);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Account {AccountId} signed in", account.Id);

        return Result.Success(IssuedSession.From(account, tokenIssuer.CreateAccessToken(account), refreshToken));
    }
}

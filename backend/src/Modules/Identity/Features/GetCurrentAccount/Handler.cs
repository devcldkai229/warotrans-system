using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Results;
using WaroTrans.Identity.Features.Shared;
using WaroTrans.Identity.Persistence;

namespace WaroTrans.Identity.Features.GetCurrentAccount;

internal sealed class GetCurrentAccountHandler(IdentityDbContext dbContext, ICurrentUser currentUser)
{
    public async Task<Result<AccountResponse>> HandleAsync(CancellationToken cancellationToken)
    {
        if (currentUser.AccountId is not { } accountId)
        {
            return Result.Failure<AccountResponse>(IdentityErrors.AccountNotFound);
        }

        // Read from the database rather than the token so the caller sees the current name, role and status.
        var account = await dbContext.Accounts
            .AsNoTracking()
            .SingleOrDefaultAsync(a => a.Id == accountId, cancellationToken);

        return account is null
            ? Result.Failure<AccountResponse>(IdentityErrors.AccountNotFound)
            : Result.Success(AccountResponse.From(account));
    }
}

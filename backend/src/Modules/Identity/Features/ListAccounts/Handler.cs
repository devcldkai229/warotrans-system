using Microsoft.EntityFrameworkCore;
using WaroTrans.Identity.Features.Shared;
using WaroTrans.Identity.Persistence;

namespace WaroTrans.Identity.Features.ListAccounts;

internal sealed class ListAccountsHandler(IdentityDbContext dbContext)
{
    public async Task<ListAccountsResponse> HandleAsync(CancellationToken cancellationToken)
    {
        var accounts = await dbContext.Accounts
            .AsNoTracking()
            .OrderBy(a => a.Username)
            .ToListAsync(cancellationToken);

        return new ListAccountsResponse(accounts.Select(AccountResponse.From).ToList());
    }
}

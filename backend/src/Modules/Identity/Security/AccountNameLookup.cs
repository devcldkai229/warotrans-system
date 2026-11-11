using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Identity.Persistence;

namespace WaroTrans.Identity.Security;

internal sealed class AccountNameLookup(IdentityDbContext db) : IAccountNameLookup
{
    public async Task<IReadOnlyDictionary<Guid, string>> GetNamesAsync(
        IReadOnlyCollection<Guid> accountIds,
        CancellationToken cancellationToken = default)
    {
        if (accountIds.Count == 0)
        {
            return new Dictionary<Guid, string>();
        }

        var accounts = await db.Accounts.AsNoTracking()
            .Where(a => accountIds.Contains(a.Id))
            .Select(a => new { a.Id, a.FullName, a.Username })
            .ToListAsync(cancellationToken);
        return accounts.ToDictionary(a => a.Id, a => string.IsNullOrWhiteSpace(a.FullName) ? a.Username : a.FullName);
    }
}

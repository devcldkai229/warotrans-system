using Microsoft.EntityFrameworkCore;
using WaroTrans.Identity.Enums;

namespace WaroTrans.Identity.Persistence;

internal static class AccountQueries
{
    /// <summary>
    /// True when someone other than <paramref name="accountId"/> can still sign in as an administrator.
    /// Used before an Admin is demoted or deactivated, so the console is never left without one.
    /// </summary>
    public static Task<bool> HasOtherActiveAdminAsync(
        this IdentityDbContext dbContext,
        Guid accountId,
        CancellationToken cancellationToken) =>
        dbContext.Accounts.AnyAsync(
            a => a.Id != accountId && a.Role == AccountRole.ADMIN && a.Status == AccountStatus.ACTIVE,
            cancellationToken);
}

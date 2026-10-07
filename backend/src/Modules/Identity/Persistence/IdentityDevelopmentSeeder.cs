using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using WaroTrans.Identity.Entities;
using WaroTrans.Identity.Enums;

namespace WaroTrans.Identity.Persistence;

/// <summary>
/// Deterministic accounts for local development only (rules/08). The passwords are public on purpose and must never
/// exist outside a Development database.
/// </summary>
internal sealed class IdentityDevelopmentSeeder(
    IdentityDbContext dbContext,
    IPasswordHasher<Account> passwordHasher,
    TimeProvider timeProvider)
{
    private sealed record SeedAccount(Guid Id, string Username, string Email, string FullName, AccountRole Role, string Password);

    private static readonly SeedAccount[] Accounts =
    [
        new(
            Guid.Parse("a0000000-0000-4000-8000-000000000001"),
            "admin",
            "admin@warotrans.local",
            "WaroTrans Admin",
            AccountRole.ADMIN,
            "Admin@123"),
        new(
            Guid.Parse("a0000000-0000-4000-8000-000000000002"),
            "staff",
            "staff@warotrans.local",
            "Warehouse Staff",
            AccountRole.STAFF,
            "Staff@123")
    ];

    public async Task SeedAsync(CancellationToken cancellationToken)
    {
        var usernames = Accounts.Select(a => a.Username).ToArray();
        var existing = await dbContext.Accounts
            .Where(a => usernames.Contains(a.Username))
            .Select(a => a.Username)
            .ToListAsync(cancellationToken);

        var now = timeProvider.GetUtcNow();
        foreach (var seed in Accounts.Where(a => !existing.Contains(a.Username)))
        {
            var account = new Account
            {
                Id = seed.Id,
                Username = seed.Username,
                Email = seed.Email,
                FullName = seed.FullName,
                Role = seed.Role,
                Status = AccountStatus.ACTIVE,
                CreatedAt = now,
                UpdatedAt = now
            };
            account.PasswordHash = passwordHasher.HashPassword(account, seed.Password);
            dbContext.Accounts.Add(account);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}

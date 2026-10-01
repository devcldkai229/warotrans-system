using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Persistence;
using WaroTrans.Identity.Entities;

namespace WaroTrans.Identity.Persistence;

public sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public DbSet<Account> Accounts => Set<Account>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("identity");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(IdentityDbContext).Assembly);
        modelBuilder.ApplySnakeCaseNamingConvention();
    }
}

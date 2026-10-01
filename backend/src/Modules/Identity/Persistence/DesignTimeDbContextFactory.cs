using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace WaroTrans.Identity.Persistence;

public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<IdentityDbContext>
{
    public IdentityDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL")
            ?? "Host=localhost;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans";

        var options = new DbContextOptionsBuilder<IdentityDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new IdentityDbContext(options);
    }
}

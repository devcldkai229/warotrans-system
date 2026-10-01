using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace WaroTrans.Navigation.Persistence;

public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<NavigationDbContext>
{
    public NavigationDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL")
            ?? "Host=localhost;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans";

        var options = new DbContextOptionsBuilder<NavigationDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new NavigationDbContext(options);
    }
}

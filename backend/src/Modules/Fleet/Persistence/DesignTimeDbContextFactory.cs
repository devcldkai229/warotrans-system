using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace WaroTrans.Fleet.Persistence;

public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<FleetDbContext>
{
    public FleetDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL")
            ?? "Host=localhost;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans";

        var options = new DbContextOptionsBuilder<FleetDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new FleetDbContext(options);
    }
}

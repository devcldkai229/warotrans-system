using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace WaroTrans.Transportation.Persistence;

public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<TransportationDbContext>
{
    public TransportationDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL")
            ?? "Host=localhost;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans";

        var options = new DbContextOptionsBuilder<TransportationDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new TransportationDbContext(options);
    }
}

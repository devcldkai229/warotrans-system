using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace WaroTrans.EvidenceBridge.Persistence;

public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<EvidenceBridgeDbContext>
{
    public EvidenceBridgeDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL")
            ?? "Host=localhost;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans";

        var options = new DbContextOptionsBuilder<EvidenceBridgeDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new EvidenceBridgeDbContext(options);
    }
}

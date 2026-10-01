using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace WaroTrans.Warehouse.Persistence;

public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<WarehouseDbContext>
{
    public WarehouseDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL")
            ?? "Host=localhost;Port=5433;Database=warotrans;Username=warotrans;Password=warotrans";

        var options = new DbContextOptionsBuilder<WarehouseDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new WarehouseDbContext(options);
    }
}

using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.UnitTests.Warehouse.Infrastructure;

public static class WarehouseTestDbContextFactory
{
    public static WarehouseDbContext Create(string dbName)
    {
        var options = new DbContextOptionsBuilder<WarehouseDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        return new WarehouseDbContext(options);
    }
}

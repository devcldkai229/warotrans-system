using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Persistence;
using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Persistence;

public sealed class WarehouseDbContext(DbContextOptions<WarehouseDbContext> options) : DbContext(options)
{
    public DbSet<Entities.Warehouse> Warehouses => Set<Entities.Warehouse>();
    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<StorageLocation> StorageLocations => Set<StorageLocation>();
    public DbSet<Container> Containers => Set<Container>();
    public DbSet<InventoryStock> InventoryStocks => Set<InventoryStock>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("warehouse");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(WarehouseDbContext).Assembly);
        modelBuilder.ApplySnakeCaseNamingConvention();
    }
}

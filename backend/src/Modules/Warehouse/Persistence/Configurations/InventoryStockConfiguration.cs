using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Persistence.Configurations;

public sealed class InventoryStockConfiguration : IEntityTypeConfiguration<InventoryStock>
{
    public void Configure(EntityTypeBuilder<InventoryStock> builder)
    {
        builder.ToTable("inventory_stocks");
        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.ProductId, x.StorageLocationId, x.LevelNo }).IsUnique();
    }
}

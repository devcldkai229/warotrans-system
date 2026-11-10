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

        // Two robots can drop the same product on the same shelf level at once; the loser retries the count.
        builder.Property(x => x.UpdatedAt).IsConcurrencyToken();

        builder.HasIndex(x => new { x.ProductId, x.StorageLocationId, x.LevelNo }).IsUnique();

        builder.HasOne(x => x.Product)
            .WithMany()
            .HasForeignKey(x => x.ProductId);

        builder.HasOne(x => x.StorageLocation)
            .WithMany()
            .HasForeignKey(x => x.StorageLocationId);
    }
}

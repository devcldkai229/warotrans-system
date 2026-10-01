using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Persistence.Configurations;

public sealed class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.ToTable("products");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Sku).HasMaxLength(100).IsRequired();
        builder.Property(x => x.SupplierBarcode).HasMaxLength(128);
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(500);

        builder.HasIndex(x => x.Sku).IsUnique();
        builder.HasIndex(x => x.SupplierBarcode)
            .IsUnique()
            .HasFilter("supplier_barcode IS NOT NULL");
    }
}

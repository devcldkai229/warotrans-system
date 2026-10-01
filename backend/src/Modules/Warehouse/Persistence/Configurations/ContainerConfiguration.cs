using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Persistence.Configurations;

public sealed class ContainerConfiguration : IEntityTypeConfiguration<Container>
{
    public void Configure(EntityTypeBuilder<Container> builder)
    {
        builder.ToTable("containers");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Barcode).HasMaxLength(100).IsRequired();
        builder.Property(x => x.SupplierPackageBarcode).HasMaxLength(128);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.UpdatedAt).IsConcurrencyToken();

        builder.HasIndex(x => x.Barcode).IsUnique();
    }
}

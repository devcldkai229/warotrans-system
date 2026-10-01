using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Persistence.Configurations;

public sealed class WarehouseConfiguration : IEntityTypeConfiguration<Entities.Warehouse>
{
    public void Configure(EntityTypeBuilder<Entities.Warehouse> builder)
    {
        builder.ToTable("warehouses");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Code).HasMaxLength(100).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(500).IsRequired();
        builder.Property(x => x.Address).HasMaxLength(500);
        builder.Property(x => x.Timezone).HasMaxLength(50).IsRequired();

        builder.HasIndex(x => x.Code).IsUnique();
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Persistence.Configurations;

public sealed class StorageLocationConfiguration : IEntityTypeConfiguration<StorageLocation>
{
    public void Configure(EntityTypeBuilder<StorageLocation> builder)
    {
        builder.ToTable("storage_locations");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Code).HasMaxLength(100).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(100).IsRequired();

        builder.HasIndex(x => x.EndpointId).IsUnique();
    }
}

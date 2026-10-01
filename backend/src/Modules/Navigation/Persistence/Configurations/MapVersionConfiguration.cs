using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Navigation.Entities;

namespace WaroTrans.Navigation.Persistence.Configurations;

public sealed class MapVersionConfiguration : IEntityTypeConfiguration<MapVersion>
{
    public void Configure(EntityTypeBuilder<MapVersion> builder)
    {
        builder.ToTable("map_versions");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Name).HasMaxLength(500).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.MapUri).HasMaxLength(500).IsRequired();

        builder.HasIndex(x => new { x.WarehouseId, x.VersionNo }).IsUnique();
    }
}

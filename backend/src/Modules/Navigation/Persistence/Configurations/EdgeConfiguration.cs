using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Navigation.Entities;

namespace WaroTrans.Navigation.Persistence.Configurations;

public sealed class EdgeConfiguration : IEntityTypeConfiguration<Edge>
{
    public void Configure(EntityTypeBuilder<Edge> builder)
    {
        builder.ToTable("edges");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Code).HasMaxLength(100).IsRequired();
        builder.Property(x => x.Geometry).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.Direction).HasConversion<string>().HasMaxLength(50).IsRequired();

        builder.HasIndex(x => new { x.MapVersionId, x.Code }).IsUnique();
        builder.HasIndex(x => x.MapVersionId);
        builder.HasIndex(x => x.Code);
        builder.HasIndex(x => x.IsActive);
    }
}

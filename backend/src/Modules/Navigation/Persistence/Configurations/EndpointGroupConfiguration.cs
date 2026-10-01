using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Navigation.Entities;

namespace WaroTrans.Navigation.Persistence.Configurations;

public sealed class EndpointGroupConfiguration : IEntityTypeConfiguration<EndpointGroup>
{
    public void Configure(EntityTypeBuilder<EndpointGroup> builder)
    {
        builder.ToTable("endpoint_groups");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Code).HasMaxLength(100).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(255).IsRequired();
        builder.Property(x => x.SelectionPolicy).HasConversion<string>().HasMaxLength(50).IsRequired();

        builder.HasIndex(x => new { x.MapVersionId, x.Code }).IsUnique();
        builder.HasIndex(x => x.MapVersionId);
        builder.HasIndex(x => x.Code);
        builder.HasIndex(x => x.IsActive);
    }
}

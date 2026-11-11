using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Persistence.Configurations;

public sealed class ContainerMovementConfiguration : IEntityTypeConfiguration<ContainerMovement>
{
    public void Configure(EntityTypeBuilder<ContainerMovement> builder)
    {
        builder.ToTable("container_movements");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(30).IsRequired();
        builder.Property(x => x.FromStatus).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.ToStatus).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.IdempotencyKey).HasMaxLength(120).IsRequired();
        builder.Property(x => x.Note).HasMaxLength(500);

        builder.HasIndex(x => x.IdempotencyKey).IsUnique();
        builder.HasIndex(x => new { x.ContainerId, x.OccurredAt });

        builder.HasOne<Container>()
            .WithMany()
            .HasForeignKey(x => x.ContainerId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Persistence.Configurations;

public sealed class RobotConfiguration : IEntityTypeConfiguration<Robot>
{
    public void Configure(EntityTypeBuilder<Robot> builder)
    {
        builder.ToTable("robots");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Code).HasMaxLength(30).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(100).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.BatteryPercent).HasPrecision(5, 2);
        builder.Property(x => x.UpdatedAt).IsConcurrencyToken();

        builder.HasIndex(x => x.Code).IsUnique();
    }
}

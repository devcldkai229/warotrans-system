using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Persistence.Configurations;

public sealed class RobotStateEventConfiguration : IEntityTypeConfiguration<RobotStateEvent>
{
    public void Configure(EntityTypeBuilder<RobotStateEvent> builder)
    {
        builder.ToTable("robot_state_events");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.FromStatus).HasConversion<string>().HasMaxLength(50);
        builder.Property(x => x.ToStatus).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.Reason).HasMaxLength(500);
        builder.Property(x => x.Source).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.Details).HasColumnType("jsonb");

        builder.HasIndex(x => x.RobotId);
        builder.HasIndex(x => x.OccurredAt);
    }
}

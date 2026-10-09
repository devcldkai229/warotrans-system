using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Persistence.Configurations;

public sealed class RobotCommandConfiguration : IEntityTypeConfiguration<RobotCommand>
{
    public void Configure(EntityTypeBuilder<RobotCommand> builder)
    {
        builder.ToTable("robot_commands");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(40).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(40).IsRequired();
        builder.Property(x => x.PayloadJson).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.Outcome).HasMaxLength(40);
        builder.Property(x => x.ErrorCode).HasMaxLength(80);
        builder.Property(x => x.RejectReasonCode).HasMaxLength(80);

        builder.HasIndex(x => x.RobotId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.JobAssignmentId);
        builder.HasIndex(x => new { x.RobotId, x.Status });
    }
}

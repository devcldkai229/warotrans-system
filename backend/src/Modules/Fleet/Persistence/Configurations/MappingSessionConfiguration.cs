using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Persistence.Configurations;

public sealed class MappingSessionConfiguration : IEntityTypeConfiguration<MappingSession>
{
    public void Configure(EntityTypeBuilder<MappingSession> builder)
    {
        builder.ToTable("mapping_sessions");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.RobotCode).HasMaxLength(50).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(x => x.MapName).HasMaxLength(200);
        builder.Property(x => x.StartedByName).HasMaxLength(200);
        builder.Property(x => x.ErrorCode).HasMaxLength(80);
        builder.Property(x => x.ErrorMessage).HasMaxLength(500);
        builder.Property(x => x.ResultMapVersionCode).HasMaxLength(80);
        builder.Property(x => x.RobotPath).HasMaxLength(300);
        builder.Ignore(x => x.IsOpen);

        builder.HasIndex(x => new { x.WarehouseId, x.StartedAt });
        builder.HasIndex(x => x.StartCommandId);
        builder.HasIndex(x => x.StopCommandId);
        // One open session per robot, enforced by the database too (two operators clicking at once).
        builder.HasIndex(x => x.RobotId)
            .IsUnique()
            .HasFilter("status IN ('STARTING','MAPPING','SAVING','CANCELLING')")
            .HasDatabaseName("ux_mapping_sessions_robot_open");
    }
}

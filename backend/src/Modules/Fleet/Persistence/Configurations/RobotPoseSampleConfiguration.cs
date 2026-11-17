using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Persistence.Configurations;

public sealed class RobotPoseSampleConfiguration : IEntityTypeConfiguration<RobotPoseSample>
{
    public void Configure(EntityTypeBuilder<RobotPoseSample> builder)
    {
        builder.ToTable("robot_pose_samples");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.MapVersionCode).HasMaxLength(100);

        // Reads are "one robot over a time range" or "one Job"; the retention sweep deletes by time.
        builder.HasIndex(x => new { x.RobotId, x.RecordedAt });
        builder.HasIndex(x => new { x.JobId, x.RecordedAt });
        builder.HasIndex(x => x.RecordedAt);
    }
}

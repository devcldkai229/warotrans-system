using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class JobRobotAssignmentConfiguration : IEntityTypeConfiguration<JobRobotAssignment>
{
    public const string ActivePerRobotIndex = "ux_job_robot_assignments_active_robot";
    public const string ActivePerJobIndex = "ux_job_robot_assignments_active_job";

    public void Configure(EntityTypeBuilder<JobRobotAssignment> builder)
    {
        builder.ToTable("job_robot_assignments");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.StartReason).HasMaxLength(30).IsRequired();
        builder.Property(x => x.EndReason).HasMaxLength(50);

        builder.HasIndex(x => x.RobotId).IsUnique().HasFilter("ended_at IS NULL").HasDatabaseName(ActivePerRobotIndex);
        builder.HasIndex(x => x.JobId).IsUnique().HasFilter("ended_at IS NULL").HasDatabaseName(ActivePerJobIndex);
        builder.HasIndex(x => new { x.RobotId, x.StartedAt });
        builder.HasIndex(x => new { x.JobId, x.StartedAt });

        builder.HasOne(x => x.Job)
            .WithMany()
            .HasForeignKey(x => x.JobId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

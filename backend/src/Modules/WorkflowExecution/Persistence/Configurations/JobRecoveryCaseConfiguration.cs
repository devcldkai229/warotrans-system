using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class JobRecoveryCaseConfiguration : IEntityTypeConfiguration<JobRecoveryCase>
{
    public void Configure(EntityTypeBuilder<JobRecoveryCase> builder)
    {
        builder.ToTable("job_recovery_cases");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Status).HasMaxLength(30).IsRequired();
        builder.Property(x => x.Reason).HasMaxLength(500).IsRequired();
        builder.Property(x => x.Note).HasMaxLength(500);
        builder.Property(x => x.ContainerIds)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<List<Guid>>(v, (JsonSerializerOptions?)null)!,
                new ValueComparer<List<Guid>>(
                    (a, b) => a!.SequenceEqual(b!),
                    v => v.Aggregate(0, (h, g) => HashCode.Combine(h, g)),
                    v => v.ToList()))
            .IsRequired();

        builder.HasIndex(x => x.JobId).IsUnique().HasFilter("resolved_at IS NULL").HasDatabaseName("ux_job_recovery_cases_open_job");
        builder.HasIndex(x => x.ToRobotId);
        builder.HasOne(x => x.Job).WithMany().HasForeignKey(x => x.JobId).OnDelete(DeleteBehavior.Cascade);
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Persistence.Configurations;

public sealed class JobAssignmentConfiguration : IEntityTypeConfiguration<JobAssignment>
{
    public void Configure(EntityTypeBuilder<JobAssignment> builder)
    {
        builder.ToTable("job_assignments");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.EndReason).HasConversion<string>().HasMaxLength(50);

        builder.HasIndex(x => x.RobotId)
            .IsUnique()
            .HasFilter("status IN ('PENDING_ACK', 'ACKNOWLEDGED', 'ACTIVE')");

        builder.HasIndex(x => x.JobId)
            .IsUnique()
            .HasFilter("status IN ('PENDING_ACK', 'ACKNOWLEDGED', 'ACTIVE')");
    }
}

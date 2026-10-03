using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class JobContainerConfiguration : IEntityTypeConfiguration<JobContainer>
{
    public void Configure(EntityTypeBuilder<JobContainer> builder)
    {
        builder.ToTable("job_containers");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();

        builder.HasIndex(x => new { x.JobId, x.ContainerId }).IsUnique();
        builder.HasIndex(x => new { x.JobId, x.SequenceNo }).IsUnique();
        builder.HasIndex(x => x.TransportRequestId);
        builder.HasIndex(x => x.ContainerId);
        builder.HasIndex(x => x.Status);

        builder.HasOne(x => x.Job)
            .WithMany(x => x.JobContainers)
            .HasForeignKey(x => x.JobId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

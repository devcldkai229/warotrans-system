using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class JobTaskConfiguration : IEntityTypeConfiguration<JobTask>
{
    public void Configure(EntityTypeBuilder<JobTask> builder)
    {
        builder.ToTable("job_tasks");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.FailureCode).HasMaxLength(50);

        builder.Property(x => x.ContextValues)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(v, (JsonSerializerOptions?)null)!)
            .IsRequired();

        builder.HasMany(x => x.JobSteps)
            .WithOne(x => x.JobTask)
            .HasForeignKey(x => x.JobTaskId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

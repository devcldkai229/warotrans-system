using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class JobStepConfiguration : IEntityTypeConfiguration<JobStep>
{
    public void Configure(EntityTypeBuilder<JobStep> builder)
    {
        builder.ToTable("job_steps");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.StepType).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.ErrorCode).HasMaxLength(50);
        builder.Property(x => x.ErrorMessage).HasMaxLength(500);

        builder.Property(x => x.ResolvedInputs)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(v, (JsonSerializerOptions?)null)!)
            .IsRequired();

        builder.Property(x => x.OutputValues)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(v, (JsonSerializerOptions?)null)!)
            .IsRequired();

        builder.HasOne(x => x.HandoverConfirmation)
            .WithOne(x => x.JobStep)
            .HasForeignKey<HandoverConfirmation>(x => x.JobStepId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

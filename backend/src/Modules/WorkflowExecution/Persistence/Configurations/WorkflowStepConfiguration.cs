using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class WorkflowStepConfiguration : IEntityTypeConfiguration<WorkflowStep>
{
    public void Configure(EntityTypeBuilder<WorkflowStep> builder)
    {
        builder.ToTable("workflow_steps");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.StepKey).HasMaxLength(150).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(255).IsRequired();
        builder.Property(x => x.StepType).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.OnFailure).HasConversion<string>().HasMaxLength(50).IsRequired();

        builder.Property(x => x.InputBindings)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(v, (JsonSerializerOptions?)null)!)
            .IsRequired();
    }
}

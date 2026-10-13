using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class WorkflowStepConfiguration : IEntityTypeConfiguration<WorkflowStep>
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public void Configure(EntityTypeBuilder<WorkflowStep> builder)
    {
        builder.ToTable("workflow_steps");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.StepKey).HasMaxLength(150).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(255).IsRequired();
        builder.Property(x => x.StepType).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.OnFailure).HasConversion<string>().HasMaxLength(50).IsRequired();

        builder.Property(x => x.Config)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, JsonOptions),
                v => JsonSerializer.Deserialize<WorkflowStepConfig>(v, JsonOptions) ?? new WorkflowStepConfig())
            .IsRequired();

        builder.Property(x => x.InputBindings)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, JsonOptions),
                v => JsonSerializer.Deserialize<Dictionary<string, StepInputBinding>>(v, JsonOptions)
                     ?? new Dictionary<string, StepInputBinding>())
            .IsRequired();
    }
}

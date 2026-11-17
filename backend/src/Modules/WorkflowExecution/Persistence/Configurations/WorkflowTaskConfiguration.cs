using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class WorkflowTaskConfiguration : IEntityTypeConfiguration<WorkflowTask>
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public void Configure(EntityTypeBuilder<WorkflowTask> builder)
    {
        builder.ToTable("workflow_tasks");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.TaskKey).HasMaxLength(150).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(255).IsRequired();

        builder.Property(x => x.RunCondition)
            .HasColumnType("jsonb")
            .HasConversion(
                v => v == null ? null : JsonSerializer.Serialize(v, JsonOptions),
                v => string.IsNullOrEmpty(v) ? null : JsonSerializer.Deserialize<TaskRunCondition>(v, JsonOptions));

        builder.HasMany(x => x.Steps)
            .WithOne(x => x.WorkflowTask)
            .HasForeignKey(x => x.WorkflowTaskId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

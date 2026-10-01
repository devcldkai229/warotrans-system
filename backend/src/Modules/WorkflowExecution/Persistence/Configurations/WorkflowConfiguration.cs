using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class WorkflowConfiguration : IEntityTypeConfiguration<Workflow>
{
    public void Configure(EntityTypeBuilder<Workflow> builder)
    {
        builder.ToTable("workflows");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Code).HasMaxLength(100).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(255).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(500);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();

        builder.Property(x => x.VariablesSchema)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<List<WorkflowVariableDefinition>>(v, (JsonSerializerOptions?)null)!)
            .IsRequired();

        builder.HasIndex(x => new { x.Code, x.VersionNo }).IsUnique();

        builder.HasMany(x => x.Tasks)
            .WithOne(x => x.Workflow)
            .HasForeignKey(x => x.WorkflowId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

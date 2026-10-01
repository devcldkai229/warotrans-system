using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.WorkflowExecution.Entities;

namespace WaroTrans.WorkflowExecution.Persistence.Configurations;

public sealed class HandoverConfirmationConfiguration : IEntityTypeConfiguration<HandoverConfirmation>
{
    public void Configure(EntityTypeBuilder<HandoverConfirmation> builder)
    {
        builder.ToTable("handover_confirmations");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.HandoverType).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.Note).HasMaxLength(500);

        builder.Property(x => x.Evidence)
            .HasColumnType("jsonb")
            .HasConversion(
                v => v == null ? null : JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => string.IsNullOrEmpty(v)
                    ? null
                    : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(v, (JsonSerializerOptions?)null));

        builder.HasIndex(x => x.JobStepId).IsUnique();
    }
}

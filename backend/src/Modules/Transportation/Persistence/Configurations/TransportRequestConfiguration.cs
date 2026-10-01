using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.ValueObjects;

namespace WaroTrans.Transportation.Persistence.Configurations;

public sealed class TransportRequestConfiguration : IEntityTypeConfiguration<TransportRequest>
{
    public void Configure(EntityTypeBuilder<TransportRequest> builder)
    {
        builder.ToTable("transport_requests");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.RequestCode).HasMaxLength(100).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.Note).HasMaxLength(500);
        builder.Property(x => x.FailureCode).HasMaxLength(50);
        builder.Property(x => x.FailureMessage).HasMaxLength(500);
        builder.Property(x => x.Version).IsConcurrencyToken();

        builder.Property(x => x.TransportData)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<TransportDataDocument>(v, (JsonSerializerOptions?)null)!)
            .IsRequired();

        builder.Property(x => x.WorkflowInputs)
            .HasColumnType("jsonb")
            .HasConversion(
                v => v == null ? null : JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => string.IsNullOrEmpty(v)
                    ? null
                    : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(v, (JsonSerializerOptions?)null));

        builder.HasIndex(x => x.RequestCode).IsUnique();
        builder.HasIndex(x => x.TransportData).HasMethod("gin").HasOperators("jsonb_ops");
    }
}

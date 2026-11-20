using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Transportation.Entities;

namespace WaroTrans.Transportation.Persistence.Configurations;

public sealed class TransportCancellationConfiguration : IEntityTypeConfiguration<TransportCancellation>
{
    public const string ActivePerRequestIndex = "ux_transport_cancellations_active_per_request";

    public void Configure(EntityTypeBuilder<TransportCancellation> builder)
    {
        builder.ToTable("transport_cancellations");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Scope).HasMaxLength(24).IsRequired();
        builder.Property(x => x.Status).HasMaxLength(40).IsRequired();
        builder.Property(x => x.ReasonCode).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Reason).HasMaxLength(500);
        builder.Property(x => x.IdempotencyKey).HasMaxLength(128).IsRequired();
        builder.Property(x => x.LastError).HasMaxLength(500);
        builder.Property(x => x.Version).IsConcurrencyToken();
        builder.Ignore(x => x.IsActive);

        builder.Property(x => x.TargetDetailIds)
            .HasColumnType("jsonb")
            .HasConversion(
                v => v == null ? null : JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => string.IsNullOrEmpty(v) ? null : JsonSerializer.Deserialize<List<Guid>>(v, (JsonSerializerOptions?)null),
                new ValueComparer<List<Guid>?>(
                    (a, b) => (a == null && b == null) || (a != null && b != null && a.SequenceEqual(b)),
                    v => v == null ? 0 : v.Aggregate(0, (h, id) => HashCode.Combine(h, id)),
                    v => v == null ? null : v.ToList()));

        builder.HasIndex(x => x.IdempotencyKey).IsUnique();
        builder.HasIndex(x => x.TransportRequestId)
            .IsUnique()
            .HasFilter("status <> 'FINALIZED'")
            .HasDatabaseName(ActivePerRequestIndex);
        builder.HasIndex(x => x.Status);

        builder.HasMany(x => x.Items)
            .WithOne(x => x.Cancellation)
            .HasForeignKey(x => x.CancellationId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class TransportCancellationItemConfiguration : IEntityTypeConfiguration<TransportCancellationItem>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public void Configure(EntityTypeBuilder<TransportCancellationItem> builder)
    {
        builder.ToTable("transport_cancellation_items");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.JobNo).HasMaxLength(100).IsRequired();
        builder.Property(x => x.RobotCode).HasMaxLength(100);
        builder.Property(x => x.Stage).HasMaxLength(40).IsRequired();

        // Containers are replaced as a whole list on every change, so comparing the serialized form is enough.
        builder.Property(x => x.Containers)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, Json),
                v => string.IsNullOrEmpty(v) ? new List<CancellationContainer>() : JsonSerializer.Deserialize<List<CancellationContainer>>(v, Json)!,
                new ValueComparer<List<CancellationContainer>>(
                    (a, b) => JsonSerializer.Serialize(a, Json) == JsonSerializer.Serialize(b, Json),
                    v => JsonSerializer.Serialize(v, Json).GetHashCode(),
                    v => JsonSerializer.Deserialize<List<CancellationContainer>>(JsonSerializer.Serialize(v, Json), Json)!));

        builder.HasIndex(x => new { x.CancellationId, x.JobId }).IsUnique();
        builder.HasIndex(x => x.JobId);
    }
}

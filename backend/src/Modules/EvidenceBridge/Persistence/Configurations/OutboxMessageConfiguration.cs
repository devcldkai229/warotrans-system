using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.EvidenceBridge.Entities;

namespace WaroTrans.EvidenceBridge.Persistence.Configurations;

internal sealed class OutboxMessageConfiguration : IEntityTypeConfiguration<OutboxMessage>
{
    public void Configure(EntityTypeBuilder<OutboxMessage> builder)
    {
        builder.ToTable("outbox_messages", t =>
            t.HasCheckConstraint("ck_outbox_messages_attempt_count", "attempt_count >= 0"));
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.EventType).HasMaxLength(96).IsRequired();
        builder.Property(x => x.Payload).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.LastError).HasMaxLength(2000);

        // The relay reads the oldest undelivered rows that are due.
        builder.HasIndex(x => new { x.CreatedAt })
            .HasDatabaseName("ix_outbox_messages_pending")
            .HasFilter("published_at IS NULL");
        builder.HasIndex(x => x.PublishedAt).HasDatabaseName("ix_outbox_messages_published_at");
    }
}

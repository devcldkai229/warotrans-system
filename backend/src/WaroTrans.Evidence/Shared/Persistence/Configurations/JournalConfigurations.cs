using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Evidence.Entities;

namespace WaroTrans.Evidence.Persistence.Configurations;

internal sealed class EvidenceJournalConfiguration : IEntityTypeConfiguration<EvidenceJournal>
{
    public void Configure(EntityTypeBuilder<EvidenceJournal> builder)
    {
        builder.ToTable("journals", t =>
            t.HasCheckConstraint("ck_journals_requested_container_count", "requested_container_count >= 0"));
        builder.HasKey(x => x.Id);
        builder.Property(x => x.RequestCode).HasMaxLength(64).IsRequired();
        builder.Property(x => x.TransportStatusSnapshot).HasMaxLength(64);
        builder.Property(x => x.RowVersion).IsConcurrencyToken();
        builder.HasIndex(x => x.TransportRequestId).IsUnique();
        builder.HasIndex(x => new { x.Status, x.UpdatedAtUtc });
        builder.HasIndex(x => x.FirstStartedAtUtc);
        builder.HasIndex(x => x.RequestCode);
        builder.HasMany(x => x.Runs).WithOne(r => r.Journal).HasForeignKey(r => r.JournalId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class RobotRunEvidenceConfiguration : IEntityTypeConfiguration<RobotRunEvidence>
{
    public void Configure(EntityTypeBuilder<RobotRunEvidence> builder)
    {
        builder.ToTable("robot_runs");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.RunCorrelationKey).HasMaxLength(160).IsRequired();
        builder.Property(x => x.SourceJobNo).HasMaxLength(64);
        builder.Property(x => x.RobotId).HasMaxLength(64).IsRequired();
        builder.Property(x => x.TransportRunStatusSnapshot).HasMaxLength(64);
        builder.Property(x => x.StartReason).HasMaxLength(32);
        builder.Property(x => x.MapVersion).HasMaxLength(64);
        builder.Property(x => x.FrameId).HasMaxLength(64);
        builder.HasIndex(x => new { x.JournalId, x.RunCorrelationKey }).IsUnique();
        builder.HasIndex(x => new { x.JournalId, x.StartedAtUtc });
        builder.HasIndex(x => new { x.RobotId, x.StartedAtUtc });
        builder.HasIndex(x => x.SourceJobId);
        builder.HasMany(x => x.Recordings).WithOne(r => r.Run).HasForeignKey(r => r.RobotRunEvidenceId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class EvidenceEventConfiguration : IEntityTypeConfiguration<EvidenceEvent>
{
    public void Configure(EntityTypeBuilder<EvidenceEvent> builder)
    {
        builder.ToTable("events");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.SourceSystem).HasMaxLength(64).IsRequired();
        builder.Property(x => x.SourceEventId).HasMaxLength(160).IsRequired();
        builder.Property(x => x.EventType).HasMaxLength(96).IsRequired();
        builder.Property(x => x.FrameId).HasMaxLength(64);
        builder.Property(x => x.Payload).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.CorrelationId).HasMaxLength(160);
        builder.HasIndex(x => new { x.SourceSystem, x.SourceEventId }).IsUnique();
        builder.HasIndex(x => new { x.JournalId, x.OccurredAtUtc });
        builder.HasIndex(x => new { x.RobotRunEvidenceId, x.OccurredAtUtc });
        builder.HasIndex(x => new { x.Severity, x.OccurredAtUtc });
        builder.HasOne<EvidenceJournal>().WithMany().HasForeignKey(x => x.JournalId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<RobotRunEvidence>().WithMany().HasForeignKey(x => x.RobotRunEvidenceId).OnDelete(DeleteBehavior.SetNull);
    }
}

internal sealed class EvidenceAnnotationConfiguration : IEntityTypeConfiguration<EvidenceAnnotation>
{
    public void Configure(EntityTypeBuilder<EvidenceAnnotation> builder)
    {
        builder.ToTable("annotations", t => t.HasCheckConstraint("ck_annotations_note_length", "char_length(note) <= 4000"));
        builder.HasKey(x => x.Id);
        builder.Property(x => x.AuthorName).HasMaxLength(128);
        builder.Property(x => x.Note).IsRequired();
        builder.HasIndex(x => new { x.JournalId, x.AtUtc });
        builder.HasOne<EvidenceJournal>().WithMany().HasForeignKey(x => x.JournalId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<RobotRunEvidence>().WithMany().HasForeignKey(x => x.RobotRunEvidenceId).OnDelete(DeleteBehavior.SetNull);
    }
}

internal sealed class EvidenceAccessAuditConfiguration : IEntityTypeConfiguration<EvidenceAccessAudit>
{
    public void Configure(EntityTypeBuilder<EvidenceAccessAudit> builder)
    {
        builder.ToTable("access_audits");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.ActorName).HasMaxLength(128);
        builder.Property(x => x.RequestId).HasMaxLength(128);
        builder.Property(x => x.Detail).HasMaxLength(500);
        builder.Property(x => x.IpAddress).HasColumnType("inet");
        builder.HasIndex(x => new { x.JournalId, x.OccurredAtUtc });
        builder.HasIndex(x => new { x.ActorUserId, x.OccurredAtUtc });
        builder.HasOne<EvidenceJournal>().WithMany().HasForeignKey(x => x.JournalId).OnDelete(DeleteBehavior.Cascade);
    }
}

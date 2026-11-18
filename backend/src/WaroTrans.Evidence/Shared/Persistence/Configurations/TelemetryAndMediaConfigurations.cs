using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Evidence.Entities;

namespace WaroTrans.Evidence.Persistence.Configurations;

internal sealed class TrajectoryPointConfiguration : IEntityTypeConfiguration<TrajectoryPoint>
{
    public void Configure(EntityTypeBuilder<TrajectoryPoint> builder)
    {
        builder.ToTable("trajectory_points");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).UseIdentityByDefaultColumn();
        builder.Property(x => x.PoseSource).HasMaxLength(48).IsRequired();
        builder.Property(x => x.FrameId).HasMaxLength(64).IsRequired();
        builder.Property(x => x.MapVersion).HasMaxLength(64);
        builder.HasIndex(x => new { x.RobotRunEvidenceId, x.SequenceNumber }).IsUnique();
        builder.HasIndex(x => new { x.RobotRunEvidenceId, x.CapturedAtUtc });
        builder.HasOne<RobotRunEvidence>().WithMany().HasForeignKey(x => x.RobotRunEvidenceId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class RoutePlanSnapshotConfiguration : IEntityTypeConfiguration<RoutePlanSnapshot>
{
    public void Configure(EntityTypeBuilder<RoutePlanSnapshot> builder)
    {
        builder.ToTable("route_plans");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.PlannerName).HasMaxLength(80);
        builder.Property(x => x.FrameId).HasMaxLength(64).IsRequired();
        builder.Property(x => x.MapVersion).HasMaxLength(64);
        builder.Property(x => x.PathPoints).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.PathHash).HasMaxLength(64);
        builder.Property(x => x.Reason).HasMaxLength(48);
        builder.HasIndex(x => new { x.RobotRunEvidenceId, x.PlanVersion }).IsUnique();
        builder.HasIndex(x => new { x.RobotRunEvidenceId, x.GeneratedAtUtc });
        builder.HasOne<RobotRunEvidence>().WithMany().HasForeignKey(x => x.RobotRunEvidenceId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class MediaAssetConfiguration : IEntityTypeConfiguration<MediaAsset>
{
    public void Configure(EntityTypeBuilder<MediaAsset> builder)
    {
        builder.ToTable("media_assets");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.ProfileVersion).HasMaxLength(64).IsRequired();
        builder.Property(x => x.OutputBucket).HasMaxLength(128);
        builder.Property(x => x.Renditions).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.FailureReason).HasMaxLength(500);
        builder.HasIndex(x => new { x.ContinuityGroupId, x.ProfileVersion }).IsUnique();
        builder.HasIndex(x => new { x.RecordingId, x.Status });
        builder.HasOne<CameraRecording>().WithMany().HasForeignKey(x => x.RecordingId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<RecordingContinuityGroup>().WithMany().HasForeignKey(x => x.ContinuityGroupId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class MediaProcessingJobConfiguration : IEntityTypeConfiguration<MediaProcessingJob>
{
    public void Configure(EntityTypeBuilder<MediaProcessingJob> builder)
    {
        builder.ToTable("media_processing_jobs", t =>
            t.HasCheckConstraint("ck_media_processing_jobs_attempts", "attempt_count >= 0"));
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Provider).HasMaxLength(32).IsRequired();
        builder.Property(x => x.ProviderJobId).HasMaxLength(128);
        builder.Property(x => x.RequestToken).HasMaxLength(64).IsRequired();
        builder.Property(x => x.InputManifestSha256).HasColumnType("char(64)").IsRequired();
        builder.Property(x => x.JobTemplateVersion).HasMaxLength(64).IsRequired();
        builder.Property(x => x.ClaimedBy).HasMaxLength(128);
        builder.Property(x => x.LastErrorCode).HasMaxLength(64);
        builder.Property(x => x.LastErrorMessage).HasMaxLength(2000);
        builder.HasIndex(x => new { x.Provider, x.ProviderJobId }).IsUnique().HasFilter("provider_job_id IS NOT NULL");
        builder.HasIndex(x => new { x.MediaAssetId, x.InputManifestSha256, x.JobTemplateVersion }).IsUnique();
        builder.HasIndex(x => new { x.Status, x.CreatedAtUtc });
        builder.HasOne<MediaAsset>().WithMany().HasForeignKey(x => x.MediaAssetId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class PlaybackSpanConfiguration : IEntityTypeConfiguration<PlaybackSpan>
{
    public void Configure(EntityTypeBuilder<PlaybackSpan> builder)
    {
        builder.ToTable("playback_spans", t =>
        {
            t.HasCheckConstraint("ck_playback_spans_utc", "utc_end >= utc_start");
            t.HasCheckConstraint("ck_playback_spans_media", "media_start_ms >= 0 AND media_end_ms >= media_start_ms");
        });
        builder.HasKey(x => x.Id);
        builder.Property(x => x.MappingMethod).HasMaxLength(32).IsRequired();
        builder.HasIndex(x => new { x.RecordingId, x.UtcStart, x.UtcEnd });
        builder.HasIndex(x => new { x.MediaAssetId, x.MediaStartMs });
        builder.HasOne<MediaAsset>().WithMany().HasForeignKey(x => x.MediaAssetId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<CameraRecording>().WithMany().HasForeignKey(x => x.RecordingId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class EvidenceInboxConfiguration : IEntityTypeConfiguration<EvidenceInbox>
{
    public void Configure(EntityTypeBuilder<EvidenceInbox> builder)
    {
        builder.ToTable("inbox");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.MessageId).HasMaxLength(160).IsRequired();
        builder.Property(x => x.Source).HasMaxLength(64).IsRequired();
        builder.Property(x => x.EventType).HasMaxLength(96);
        builder.Property(x => x.Hash).HasColumnType("char(64)").IsRequired();
        builder.HasIndex(x => new { x.Source, x.MessageId }).IsUnique();
        builder.HasIndex(x => x.ProcessedAtUtc);
    }
}

internal sealed class EvidenceOutboxConfiguration : IEntityTypeConfiguration<EvidenceOutbox>
{
    public void Configure(EntityTypeBuilder<EvidenceOutbox> builder)
    {
        builder.ToTable("outbox", t => t.HasCheckConstraint("ck_outbox_attempts", "attempt_count >= 0"));
        builder.HasKey(x => x.Id);
        builder.Property(x => x.EventType).HasMaxLength(96).IsRequired();
        builder.Property(x => x.Payload).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.LastError).HasMaxLength(2000);
        builder.HasIndex(x => x.CreatedAtUtc).HasFilter("published_at_utc IS NULL");
    }
}

internal sealed class LocalQueueMessageConfiguration : IEntityTypeConfiguration<LocalQueueMessage>
{
    public void Configure(EntityTypeBuilder<LocalQueueMessage> builder)
    {
        builder.ToTable("local_queue_messages");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Queue).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Body).IsRequired();
        builder.Property(x => x.ReceiptHandle).HasMaxLength(64);
        builder.HasIndex(x => new { x.Queue, x.VisibleAtUtc });
    }
}

internal sealed class RobotCredentialConfiguration : IEntityTypeConfiguration<RobotCredential>
{
    public void Configure(EntityTypeBuilder<RobotCredential> builder)
    {
        builder.ToTable("robot_credentials");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.RobotCode).HasMaxLength(64).IsRequired();
        builder.Property(x => x.TokenSha256).HasColumnType("char(64)").IsRequired();
        builder.HasIndex(x => x.TokenSha256).IsUnique();
        builder.HasIndex(x => x.RobotCode).HasFilter("revoked_at_utc IS NULL");
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Evidence.Entities;

namespace WaroTrans.Evidence.Persistence.Configurations;

internal sealed class CameraRecordingConfiguration : IEntityTypeConfiguration<CameraRecording>
{
    public void Configure(EntityTypeBuilder<CameraRecording> builder)
    {
        builder.ToTable("camera_recordings", t =>
        {
            t.HasCheckConstraint("ck_camera_recordings_size", "width > 0 AND height > 0 AND target_fps > 0");
        });
        builder.HasKey(x => x.Id);
        builder.Property(x => x.CameraId).HasMaxLength(64).IsRequired();
        builder.Property(x => x.CameraModel).HasMaxLength(128).IsRequired();
        builder.Property(x => x.CameraCalibrationVersion).HasMaxLength(64);
        builder.Property(x => x.MountPose).HasColumnType("jsonb");
        builder.Property(x => x.SourceCodec).HasMaxLength(24).IsRequired();
        builder.Property(x => x.CaptureSoftwareVersion).HasMaxLength(64).IsRequired();
        builder.Property(x => x.EdgeRecordingKey).HasMaxLength(64);
        builder.HasIndex(x => new { x.RobotRunEvidenceId, x.StartedAtUtc });
        builder.HasIndex(x => x.EdgeRecordingKey).IsUnique().HasFilter("edge_recording_key IS NOT NULL");
        builder.HasMany(x => x.Groups).WithOne(g => g.Recording).HasForeignKey(g => g.RecordingId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(x => x.Segments).WithOne(s => s.Recording).HasForeignKey(s => s.RecordingId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class RecordingContinuityGroupConfiguration : IEntityTypeConfiguration<RecordingContinuityGroup>
{
    public void Configure(EntityTypeBuilder<RecordingContinuityGroup> builder)
    {
        builder.ToTable("continuity_groups", t =>
            t.HasCheckConstraint("ck_continuity_groups_sequence", "first_sequence_number >= 0 AND (last_sequence_number IS NULL OR last_sequence_number >= first_sequence_number)"));
        builder.HasKey(x => x.Id);
        builder.HasIndex(x => new { x.RecordingId, x.GroupOrdinal }).IsUnique();
    }
}

internal sealed class VideoSegmentConfiguration : IEntityTypeConfiguration<VideoSegment>
{
    public void Configure(EntityTypeBuilder<VideoSegment> builder)
    {
        builder.ToTable("video_segments", t =>
        {
            t.HasCheckConstraint("ck_video_segments_time", "captured_to_utc >= captured_from_utc");
            t.HasCheckConstraint("ck_video_segments_counts",
                "sequence_number >= 0 AND frame_count >= 0 AND dropped_frame_count >= 0 AND duplicated_frame_count >= 0 AND byte_size >= 0 AND duration_ms >= 0 AND upload_attempt_count >= 0");
            t.HasCheckConstraint("ck_video_segments_sha256", "sha256 ~ '^[0-9a-f]{64}$'");
        });
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.ContainerFormat).HasMaxLength(16).IsRequired();
        builder.Property(x => x.Codec).HasMaxLength(24).IsRequired();
        builder.Property(x => x.Sha256).HasColumnType("char(64)").IsRequired();
        builder.Property(x => x.S3Bucket).HasMaxLength(128);
        builder.Property(x => x.S3VersionId).HasMaxLength(256);
        builder.Property(x => x.S3ETag).HasMaxLength(256);
        builder.Property(x => x.UploadError).HasMaxLength(500);
        builder.HasIndex(x => new { x.RecordingId, x.SequenceNumber }).IsUnique();
        builder.HasIndex(x => new { x.S3Bucket, x.S3Key }).IsUnique().HasFilter("s3_key IS NOT NULL");
        builder.HasIndex(x => new { x.ContinuityGroupId, x.SequenceNumber });
        builder.HasIndex(x => new { x.UploadStatus, x.CreatedAtUtc });
        builder.HasOne(x => x.ContinuityGroup).WithMany().HasForeignKey(x => x.ContinuityGroupId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ClockAnchorConfiguration : IEntityTypeConfiguration<ClockAnchor>
{
    public void Configure(EntityTypeBuilder<ClockAnchor> builder)
    {
        builder.ToTable("clock_anchors");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).UseIdentityByDefaultColumn();
        builder.Property(x => x.RobotId).HasMaxLength(64).IsRequired();
        builder.Property(x => x.SyncSource).HasMaxLength(32).IsRequired();
        builder.HasIndex(x => new { x.RobotId, x.BootSessionId, x.MonotonicNs }).IsUnique();
        builder.HasIndex(x => new { x.RobotId, x.UtcEstimate });
    }
}

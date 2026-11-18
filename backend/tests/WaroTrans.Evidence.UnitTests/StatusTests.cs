using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Status;

namespace WaroTrans.Evidence.UnitTests;

public class StatusTransitionsTests
{
    [Theory]
    [InlineData(SegmentUploadStatus.REGISTERED, SegmentUploadStatus.UPLOAD_PENDING, true)]
    [InlineData(SegmentUploadStatus.UPLOADED, SegmentUploadStatus.VERIFIED, true)]
    [InlineData(SegmentUploadStatus.UPLOADED, SegmentUploadStatus.QUARANTINED, true)]
    [InlineData(SegmentUploadStatus.FAILED, SegmentUploadStatus.UPLOAD_PENDING, true)]
    [InlineData(SegmentUploadStatus.VERIFIED, SegmentUploadStatus.UPLOADED, false)]
    [InlineData(SegmentUploadStatus.QUARANTINED, SegmentUploadStatus.VERIFIED, false)]
    public void Segment_moves(SegmentUploadStatus from, SegmentUploadStatus to, bool allowed) =>
        Assert.Equal(allowed, StatusTransitions.CanMove(from, to));

    [Theory]
    [InlineData(MediaProcessingStatus.SUBMITTED, MediaProcessingStatus.COMPLETE, true)]
    [InlineData(MediaProcessingStatus.SUBMITTING, MediaProcessingStatus.RETRY_PENDING, true)]
    [InlineData(MediaProcessingStatus.COMPLETE, MediaProcessingStatus.PROGRESSING, false)]
    [InlineData(MediaProcessingStatus.ERROR, MediaProcessingStatus.QUEUED, false)]
    public void Processing_job_moves(MediaProcessingStatus from, MediaProcessingStatus to, bool allowed) =>
        Assert.Equal(allowed, StatusTransitions.CanMove(from, to));

    [Fact]
    public void A_ready_asset_is_never_moved_back()
    {
        Assert.False(StatusTransitions.CanMove(MediaAssetStatus.READY, MediaAssetStatus.PROCESSING));
        Assert.Throws<InvalidOperationException>(() =>
            StatusTransitions.Move(MediaAssetStatus.READY, MediaAssetStatus.FAILED, StatusTransitions.CanMove));
    }
}

public class EvidenceStatusCalculatorTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 17, 10, 0, 0, TimeSpan.Zero);
    private static readonly EvidencePolicy Policy = new(VideoRequired: true, FinalizeGrace: TimeSpan.FromMinutes(15));

    [Fact]
    public void A_run_still_held_is_pending_until_something_is_recorded()
    {
        Assert.Equal(EvidenceRunStatus.PENDING, EvidenceStatusCalculator.Run(new(null, [], false), Now, Policy));
        Assert.Equal(EvidenceRunStatus.RECORDING, EvidenceStatusCalculator.Run(new(null, [RecordingStatus.RECORDING], false), Now, Policy));
        Assert.Equal(EvidenceRunStatus.RECORDING, EvidenceStatusCalculator.Run(new(null, [], true), Now, Policy));
    }

    [Fact]
    public void An_ended_run_with_uploads_in_flight_is_finalizing()
    {
        var run = new RunFacts(Now.AddHours(-2), [RecordingStatus.READY, RecordingStatus.UPLOADING], true);
        Assert.Equal(EvidenceRunStatus.FINALIZING, EvidenceStatusCalculator.Run(run, Now, Policy));
    }

    [Fact]
    public void Missing_video_is_declared_only_after_the_grace_period()
    {
        Assert.Equal(EvidenceRunStatus.FINALIZING, EvidenceStatusCalculator.Run(new(Now.AddMinutes(-5), [], true), Now, Policy));
        Assert.Equal(EvidenceRunStatus.PARTIAL, EvidenceStatusCalculator.Run(new(Now.AddMinutes(-16), [], true), Now, Policy));
        Assert.Equal(EvidenceRunStatus.CAPTURE_FAILED, EvidenceStatusCalculator.Run(new(Now.AddMinutes(-16), [], false), Now, Policy));
    }

    [Fact]
    public void Without_a_video_requirement_an_ended_run_with_no_recording_is_complete()
    {
        var policy = Policy with { VideoRequired = false };
        Assert.Equal(EvidenceRunStatus.FINALIZED, EvidenceStatusCalculator.Run(new(Now.AddMinutes(-1), [], true), Now, policy));
    }

    [Fact]
    public void A_run_is_partial_when_one_of_its_recordings_is()
    {
        Assert.Equal(EvidenceRunStatus.FINALIZED,
            EvidenceStatusCalculator.Run(new(Now.AddMinutes(-1), [RecordingStatus.READY, RecordingStatus.READY], true), Now, Policy));
        Assert.Equal(EvidenceRunStatus.PARTIAL,
            EvidenceStatusCalculator.Run(new(Now.AddMinutes(-1), [RecordingStatus.READY, RecordingStatus.PARTIAL], true), Now, Policy));
    }

    [Fact]
    public void A_journal_stays_open_while_the_request_may_still_start_a_trip()
    {
        var ended = new[] { EvidenceRunStatus.FINALIZED };
        Assert.Equal(EvidenceJournalStatus.OPEN, EvidenceStatusCalculator.Journal(ended, "IN_PROGRESS"));
        Assert.Equal(EvidenceJournalStatus.OPEN, EvidenceStatusCalculator.Journal(ended, "PARTIALLY_COMPLETED"));
        Assert.Equal(EvidenceJournalStatus.OPEN, EvidenceStatusCalculator.Journal(ended, null));
        Assert.Equal(EvidenceJournalStatus.FINALIZED, EvidenceStatusCalculator.Journal(ended, "COMPLETED"));
    }

    [Fact]
    public void Journal_status_follows_evidence_not_delivery()
    {
        // The trip failed but its evidence is complete; another delivered but has no video.
        Assert.Equal(EvidenceJournalStatus.FINALIZED,
            EvidenceStatusCalculator.Journal([EvidenceRunStatus.FINALIZED], "FAILED"));
        Assert.Equal(EvidenceJournalStatus.PARTIAL,
            EvidenceStatusCalculator.Journal([EvidenceRunStatus.FINALIZED, EvidenceRunStatus.PARTIAL], "COMPLETED"));
        Assert.Equal(EvidenceJournalStatus.FINALIZING,
            EvidenceStatusCalculator.Journal([EvidenceRunStatus.FINALIZING, EvidenceRunStatus.PARTIAL], "COMPLETED"));
        Assert.Equal(EvidenceJournalStatus.OPEN,
            EvidenceStatusCalculator.Journal([EvidenceRunStatus.FINALIZED, EvidenceRunStatus.RECORDING], "COMPLETED"));
        Assert.Equal(EvidenceJournalStatus.OPEN, EvidenceStatusCalculator.Journal([], "COMPLETED"));
    }
}

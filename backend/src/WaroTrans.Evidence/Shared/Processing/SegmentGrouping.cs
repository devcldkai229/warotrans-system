using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;

namespace WaroTrans.Evidence.Processing;

/// <summary>
/// Which continuity group a new segment joins (spec §4.4). Media is only ever stitched inside one group, so a hole in
/// time must start a new group: a gap is shown as a gap during replay, never played over.
/// </summary>
public static class SegmentGrouping
{
    /// <summary>Segments further apart than this do not play back to back.</summary>
    public static readonly TimeSpan MaxJoinGap = TimeSpan.FromSeconds(2);

    /// <summary>A segment starting this much before the previous one ended means the clock jumped back.</summary>
    public static readonly TimeSpan MaxOverlap = TimeSpan.FromSeconds(1);

    /// <returns>Null to join <paramref name="last"/>; otherwise why a new group starts.</returns>
    public static ContinuityGapReason? NewGroupReason(RecordingContinuityGroup? last, VideoSegment? lastSegment, VideoSegment next, int segmentsInLast)
    {
        if (last is null || lastSegment is null)
        {
            return null;
        }

        if (last.Status != ContinuityGroupStatus.OPEN)
        {
            return ContinuityGapReason.FRAME_GAP;
        }

        if (next.BootSessionId != lastSegment.BootSessionId)
        {
            return ContinuityGapReason.REBOOT;
        }

        if (next.SequenceNumber != lastSegment.SequenceNumber + 1)
        {
            return ContinuityGapReason.FRAME_GAP;
        }

        if (next.CapturedFromUtc < lastSegment.CapturedToUtc - MaxOverlap)
        {
            return ContinuityGapReason.CLOCK_UNCERTAIN;
        }

        if (next.CapturedFromUtc - lastSegment.CapturedToUtc > MaxJoinGap)
        {
            return ContinuityGapReason.FRAME_GAP;
        }

        return segmentsInLast >= RecordingContinuityGroup.MaxSegments ? ContinuityGapReason.INPUT_LIMIT : null;
    }
}

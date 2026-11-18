using WaroTrans.Evidence.Entities;

namespace WaroTrans.Evidence.Media;

/// <summary>
/// Capture UTC ↔ media time of an asset (spec §4.11, §6.3), built from what was recorded, then checked against what
/// the transcoder produced.
/// <para>
/// The robot writes constant-frame-rate slots on its capture clock (CFR_SLOT_V1): inside a segment, media time
/// k/fps is slot k, whose UTC is CapturedFrom + k/fps. Segments of one group are stitched back to back, so a
/// segment's media start is the sum of the earlier segments' frame counts / fps. One span per segment keeps a clock
/// step between segments from smearing over the whole asset.
/// </para>
/// <para>
/// The bound states how wrong a cursor can be: the worst slot-to-capture error seen in the segment, plus the robot's
/// clock sync bound during the run, plus any difference between the expected and the measured output duration
/// (frame-rate conversion would show up there). A mismatch beyond tolerance marks the mapping unverified instead of
/// pretending it is exact.
/// </para>
/// </summary>
public static class PlaybackSpanBuilder
{
    public const string CfrSlotV1 = "CFR_SLOT_V1";
    public const string CfrSlotV1Unverified = "CFR_SLOT_V1_UNVERIFIED";

    /// <summary>Output may differ from the frame sum by this much (encoder rounding, last GOP) and still count as verified.</summary>
    public const double DurationTolerance = 0.02;

    public sealed record Result(IReadOnlyList<PlaybackSpan> Spans, long ExpectedDurationMs, bool Verified);

    public static Result Build(
        Guid mediaAssetId,
        Guid recordingId,
        IReadOnlyList<VideoSegment> segments,
        double fps,
        double? clockErrorBoundMs,
        long? measuredDurationMs,
        DateTimeOffset now)
    {
        var ordered = segments.OrderBy(s => s.SequenceNumber).ToList();
        var expected = (long)Math.Round(ordered.Sum(s => s.FrameCount) * 1000.0 / fps);
        var mismatchMs = measuredDurationMs is { } measured ? Math.Abs(measured - expected) : 0;
        var verified = measuredDurationMs is null || mismatchMs <= Math.Max(1000.0 / fps, expected * DurationTolerance);
        var clock = clockErrorBoundMs is { } c && double.IsFinite(c) && c < 1e8 ? c : 1000.0;
        var spans = new List<PlaybackSpan>();
        long mediaStart = 0;
        foreach (var s in ordered)
        {
            var length = (long)Math.Round(s.FrameCount * 1000.0 / fps);
            spans.Add(new PlaybackSpan
            {
                Id = Guid.NewGuid(),
                MediaAssetId = mediaAssetId,
                RecordingId = recordingId,
                UtcStart = s.CapturedFromUtc,
                UtcEnd = s.CapturedFromUtc.AddMilliseconds(length),
                MediaStartMs = mediaStart,
                MediaEndMs = mediaStart + length,
                TimeErrorBoundMs = (float)((s.MaxSlotErrorMs ?? 1000.0 / fps) + clock + (verified ? 0 : mismatchMs)),
                MappingMethod = verified ? CfrSlotV1 : CfrSlotV1Unverified,
                CreatedAtUtc = now
            });
            mediaStart += length;
        }

        return new Result(spans, expected, verified);
    }

    /// <summary>The media time of a UTC instant, or null when no span holds it (a gap: no video at that time).</summary>
    public static double? MediaSecondsAt(IEnumerable<PlaybackSpan> spans, DateTimeOffset utc) =>
        spans.FirstOrDefault(s => s.UtcStart <= utc && utc < s.UtcEnd) is { } span
            ? (span.MediaStartMs + (utc - span.UtcStart).TotalMilliseconds) / 1000.0
            : null;
}

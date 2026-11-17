using WaroTrans.Evidence.Storage;

namespace WaroTrans.Evidence.UnitTests;

public class EvidenceKeysTests
{
    private static readonly Guid Request = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Journal = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Run = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid Recording = Guid.Parse("44444444-4444-4444-4444-444444444444");
    private static readonly Guid Segment = Guid.Parse("55555555-5555-5555-5555-555555555555");

    [Fact]
    public void Segment_key_follows_the_raw_layout_and_reads_back_its_id()
    {
        var key = EvidenceKeys.Segment(Request, Journal, Run, "front", Recording, 2, Segment);

        Assert.Equal(
            "raw/transport-requests/11111111-1111-1111-1111-111111111111/journal/22222222-2222-2222-2222-222222222222/runs/33333333-3333-3333-3333-333333333333/cameras/front/recordings/44444444-4444-4444-4444-444444444444/group-2/segments/55555555-5555-5555-5555-555555555555.avi",
            key);
        Assert.Equal(Segment, EvidenceKeys.SegmentIdOf(key));
    }

    [Theory]
    [InlineData("raw/transport-requests/x/sidecars/55555555-5555-5555-5555-555555555555.timing.json")]
    [InlineData("playback/transport-requests/x/segments/55555555-5555-5555-5555-555555555555.avi")]
    [InlineData("raw/transport-requests/x/segments/not-a-guid.avi")]
    [InlineData("raw/transport-requests/x/other/55555555-5555-5555-5555-555555555555.avi")]
    [InlineData("maps/wh/map.pgm")]
    public void Only_raw_segment_files_are_segments(string key) =>
        Assert.Null(EvidenceKeys.SegmentIdOf(key));

    [Fact]
    public void Playback_output_never_falls_under_the_raw_prefix_ingest_listens_to()
    {
        var output = EvidenceKeys.PlaybackAttempt(Request, Run, "front", Recording, Guid.NewGuid(), "hls-v1", Guid.NewGuid());

        Assert.StartsWith(EvidenceKeys.PlaybackPrefix, output);
        Assert.False(output.StartsWith(EvidenceKeys.RawPrefix, StringComparison.Ordinal));
        Assert.EndsWith("/", output);
    }

    [Theory]
    [InlineData("../front")]
    [InlineData("Front")]
    [InlineData("front/../../x")]
    [InlineData("")]
    public void A_camera_id_cannot_shape_the_path(string camera) =>
        Assert.Throws<ArgumentException>(() => EvidenceKeys.Segment(Request, Journal, Run, camera, Recording, 1, Segment));
}

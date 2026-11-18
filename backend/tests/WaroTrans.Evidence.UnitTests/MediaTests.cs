extern alias worker;

using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Media;
using MediaConvertTranscoder = worker::WaroTrans.Evidence.Worker.Services.MediaConvertTranscoder;

namespace WaroTrans.Evidence.UnitTests;

public class PlaybackSpanBuilderTests
{
    private static readonly DateTimeOffset T0 = new(2026, 11, 17, 10, 0, 0, TimeSpan.Zero);

    private static VideoSegment Seg(int seq, DateTimeOffset from, int frames, double slotErrorMs = 30) => new()
    {
        SequenceNumber = seq, CapturedFromUtc = from, CapturedToUtc = from.AddSeconds(frames / 15.0), FrameCount = frames, MaxSlotErrorMs = slotErrorMs
    };

    [Fact]
    public void Segments_stitch_back_to_back_in_media_time_and_keep_their_own_capture_time()
    {
        var segments = new[] { Seg(1, T0.AddSeconds(30.2), 450), Seg(0, T0, 450), Seg(2, T0.AddSeconds(60.1), 300) };
        var result = PlaybackSpanBuilder.Build(Guid.NewGuid(), Guid.NewGuid(), segments, 15, 2.5, 80_000, T0);

        Assert.True(result.Verified);
        Assert.Equal(80_000, result.ExpectedDurationMs);
        Assert.Equal([0L, 30_000L, 60_000L], result.Spans.Select(s => s.MediaStartMs));
        Assert.Equal([T0, T0.AddSeconds(30.2), T0.AddSeconds(60.1)], result.Spans.Select(s => s.UtcStart));
        Assert.All(result.Spans, s => Assert.Equal(PlaybackSpanBuilder.CfrSlotV1, s.MappingMethod));
        Assert.All(result.Spans, s => Assert.Equal(32.5f, s.TimeErrorBoundMs!.Value, 3));
    }

    [Fact]
    public void An_output_that_does_not_last_what_the_frames_say_is_marked_unverified_with_a_wider_bound()
    {
        var result = PlaybackSpanBuilder.Build(Guid.NewGuid(), Guid.NewGuid(), [Seg(0, T0, 450)], 15, 2.0, 27_000, T0);
        Assert.False(result.Verified);
        Assert.Equal(PlaybackSpanBuilder.CfrSlotV1Unverified, result.Spans[0].MappingMethod);
        Assert.True(result.Spans[0].TimeErrorBoundMs > 3000);
    }

    [Fact]
    public void An_unsynchronized_clock_does_not_pretend_to_be_precise()
    {
        var result = PlaybackSpanBuilder.Build(Guid.NewGuid(), Guid.NewGuid(), [Seg(0, T0, 450)], 15, 1e9, null, T0);
        Assert.True(result.Spans[0].TimeErrorBoundMs >= 1000);
    }

    [Fact]
    public void A_utc_cursor_maps_inside_a_span_and_to_nothing_in_a_gap()
    {
        var spans = PlaybackSpanBuilder.Build(Guid.NewGuid(), Guid.NewGuid(), [Seg(0, T0, 150), Seg(1, T0.AddSeconds(20), 150)], 15, 1, null, T0).Spans;
        Assert.Equal(4.0, PlaybackSpanBuilder.MediaSecondsAt(spans, T0.AddSeconds(4)));
        Assert.Equal(13.0, PlaybackSpanBuilder.MediaSecondsAt(spans, T0.AddSeconds(23)));
        Assert.Null(PlaybackSpanBuilder.MediaSecondsAt(spans, T0.AddSeconds(15)));
    }
}

public class HlsAndEventTests
{
    private const string Master = """
        #EXTM3U
        #EXT-X-VERSION:3
        #EXT-X-STREAM-INF:BANDWIDTH=2628000,RESOLUTION=1280x720,CODECS="avc1.4d401f"
        master_720p.m3u8
        #EXT-X-STREAM-INF:BANDWIDTH=1100000,RESOLUTION=854x480
        480p/index.m3u8
        """;

    private const string Media = """
        #EXTM3U
        #EXT-X-TARGETDURATION:6
        #EXTINF:6.000,
        master_720p_00001.ts
        #EXTINF:6.000,
        master_720p_00002.ts
        #EXTINF:2.533,
        master_720p_00003.ts
        #EXT-X-ENDLIST
        """;

    [Fact]
    public void Master_and_media_playlists_are_read()
    {
        var variants = HlsPlaylists.ParseMaster(Master);
        Assert.Equal(2, variants.Count);
        Assert.Equal((1280, 720), (variants[0].Width!.Value, variants[0].Height!.Value));
        Assert.Equal("480p/index.m3u8", variants[1].Uri);
        var media = HlsPlaylists.ParseMedia(Media);
        Assert.Equal(3, media.Segments.Count);
        Assert.Equal(14.533, media.DurationSeconds, 3);
        Assert.True(media.Ended);
        Assert.Throws<FormatException>(() => HlsPlaylists.ParseMedia("<html>"));
    }

    [Fact]
    public void Uris_resolve_against_their_playlist()
    {
        Assert.Equal("p/a/480p/index.m3u8", HlsPlaylists.Resolve("p/a/master.m3u8", "480p/index.m3u8"));
        Assert.Equal("p/a/480p/segment-00001.ts", HlsPlaylists.Resolve("p/a/480p/index.m3u8", "segment-00001.ts"));
        Assert.Equal("p/x.ts", HlsPlaylists.Resolve("p/a/master.m3u8", "../x.ts"));
    }

    [Fact]
    public void An_EventBridge_MediaConvert_event_is_read_and_the_local_one_has_the_same_shape()
    {
        var job = Guid.NewGuid();
        var aws = $$$"""
            {"version":"0","id":"e","detail-type":"MediaConvert Job State Change","source":"aws.mediaconvert",
             "detail":{"timestamp":1,"accountId":"1","queue":"arn:q","jobId":"1700000000000-abc","status":"COMPLETE",
             "userMetadata":{"processingJobId":"{{{job}}}"},
             "outputGroupDetails":[{"outputDetails":[{"outputFilePaths":["s3://b/p/master_720p.m3u8"],"durationInMs":30033},
                                                     {"durationInMs":30000}],"type":"HLS_GROUP"}]}}
            """;
        var parsed = MediaJobEvents.Parse(aws)!;
        Assert.Equal(("1700000000000-abc", "COMPLETE", job, 30000L), (parsed.ProviderJobId, parsed.Status, parsed.ProcessingJobId!.Value, parsed.OutputDurationMs!.Value));
        Assert.Null(MediaJobEvents.Parse("""{"Records":[]}"""));
        var local = MediaJobEvents.Parse(MediaJobEvents.Write(parsed with { Status = "ERROR", ErrorCode = "1010", ErrorMessage = "bad input" }))!;
        Assert.Equal(("ERROR", "1010", "bad input", job), (local.Status, local.ErrorCode, local.ErrorMessage, local.ProcessingJobId!.Value));
    }

    [Fact]
    public void Profile_hls_v1_stitches_inputs_in_sequence_order_and_keeps_the_source_frame_rate()
    {
        var request = new TranscodeRequest(Guid.NewGuid(), Guid.NewGuid(), "token", "raw-bucket", ["raw/a/0.avi", "raw/a/1.avi", "raw/a/2.avi"],
            "play-bucket", "playback/x/attempts/y/", "hls-v1", 15, 1280, 720, new string('a', 64));
        var settings = MediaConvertTranscoder.Settings(request, 6);
        Assert.Equal(["s3://raw-bucket/raw/a/0.avi", "s3://raw-bucket/raw/a/1.avi", "s3://raw-bucket/raw/a/2.avi"], settings.Inputs.Select(i => i.FileInput));
        var group = Assert.Single(settings.OutputGroups);
        Assert.Equal("s3://play-bucket/playback/x/attempts/y/master", group.OutputGroupSettings.HlsGroupSettings.Destination);
        Assert.Equal([720, 480], group.Outputs.Select(o => o.VideoDescription.Height));
        Assert.All(group.Outputs, o => Assert.Equal("INITIALIZE_FROM_SOURCE", o.VideoDescription.CodecSettings.H264Settings.FramerateControl.Value));
    }
}

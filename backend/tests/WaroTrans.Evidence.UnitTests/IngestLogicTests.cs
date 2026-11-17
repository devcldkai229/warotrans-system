using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Processing;
using WaroTrans.Evidence.Storage;

namespace WaroTrans.Evidence.UnitTests;

public class SegmentGroupingTests
{
    private static readonly DateTimeOffset T0 = new(2026, 11, 17, 3, 0, 0, TimeSpan.Zero);
    private static readonly Guid Boot = Guid.NewGuid();

    private static VideoSegment Seg(int seq, DateTimeOffset from, Guid? boot = null) => new()
    {
        SequenceNumber = seq, CapturedFromUtc = from, CapturedToUtc = from.AddSeconds(30), BootSessionId = boot ?? Boot
    };

    private static readonly RecordingContinuityGroup Open = new() { Status = ContinuityGroupStatus.OPEN };

    [Fact]
    public void The_next_segment_on_time_joins_the_group() =>
        Assert.Null(SegmentGrouping.NewGroupReason(Open, Seg(0, T0), Seg(1, T0.AddSeconds(30.4)), 1));

    [Fact]
    public void The_first_segment_starts_the_first_group() =>
        Assert.Null(SegmentGrouping.NewGroupReason(null, null, Seg(0, T0), 0));

    [Theory]
    [InlineData(33, ContinuityGapReason.FRAME_GAP)]   // 3 s without video
    [InlineData(28, ContinuityGapReason.CLOCK_UNCERTAIN)] // starts 2 s before the previous one ended
    public void A_hole_or_a_clock_jump_starts_a_new_group(int startSeconds, ContinuityGapReason reason) =>
        Assert.Equal(reason, SegmentGrouping.NewGroupReason(Open, Seg(0, T0), Seg(1, T0.AddSeconds(startSeconds)), 1));

    [Fact]
    public void A_reboot_a_skipped_sequence_or_a_full_group_starts_a_new_group()
    {
        Assert.Equal(ContinuityGapReason.REBOOT, SegmentGrouping.NewGroupReason(Open, Seg(0, T0), Seg(1, T0.AddSeconds(30), Guid.NewGuid()), 1));
        Assert.Equal(ContinuityGapReason.FRAME_GAP, SegmentGrouping.NewGroupReason(Open, Seg(0, T0), Seg(2, T0.AddSeconds(30)), 1));
        Assert.Equal(ContinuityGapReason.INPUT_LIMIT,
            SegmentGrouping.NewGroupReason(Open, Seg(149, T0), Seg(150, T0.AddSeconds(30)), RecordingContinuityGroup.MaxSegments));
    }

    [Fact]
    public void The_manifest_hash_depends_on_the_set_and_its_order_not_on_the_list_order()
    {
        var a = new VideoSegment { SequenceNumber = 0, Sha256 = new string('a', 64) };
        var b = new VideoSegment { SequenceNumber = 1, Sha256 = new string('b', 64) };
        Assert.Equal(GroupReadiness.ManifestSha256([a, b]), GroupReadiness.ManifestSha256([b, a]));
        Assert.NotEqual(GroupReadiness.ManifestSha256([a, b]), GroupReadiness.ManifestSha256([a]));
    }
}

public class S3EventsTests
{
    [Fact]
    public void An_object_created_notification_gives_bucket_decoded_key_and_size()
    {
        const string body = """
            {"Records":[{"eventVersion":"2.1","eventSource":"aws:s3","eventName":"ObjectCreated:Put",
            "s3":{"bucket":{"name":"warotrans-ob-storage"},"object":{"key":"raw/transport-requests/a+b%3Dc/x.avi","size":42,"eTag":"e","versionId":"v1"}}}]}
            """;
        var record = Assert.Single(S3Events.Parse(body));
        Assert.Equal("warotrans-ob-storage", record.Bucket);
        Assert.Equal("raw/transport-requests/a b=c/x.avi", record.Key);
        Assert.Equal(42, record.Size);
        Assert.Equal("v1", record.VersionId);
    }

    [Fact]
    public void The_test_event_and_deletions_are_not_records()
    {
        Assert.Empty(S3Events.Parse("""{"Service":"Amazon S3","Event":"s3:TestEvent","Bucket":"b"}"""));
        Assert.Empty(S3Events.Parse("""{"Records":[{"eventName":"ObjectRemoved:Delete","s3":{"bucket":{"name":"b"},"object":{"key":"k"}}}]}"""));
    }

    [Fact]
    public void The_local_store_writes_what_the_parser_reads()
    {
        var stored = new StoredObject("bucket", "raw/transport-requests/r/segments/s.avi", 7, null, "\"e\"", null, DateTimeOffset.UtcNow);
        var record = Assert.Single(S3Events.Parse(S3Events.ObjectCreated(stored, DateTimeOffset.UtcNow)));
        Assert.Equal(stored.Key, record.Key);
        Assert.Equal(7, record.Size);
    }
}

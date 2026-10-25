using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

public sealed class TrafficEventOutboxTests
{
    [Fact]
    public async Task Publish_ThenRead_YieldsEvent()
    {
        var outbox = new TrafficEventOutbox(16);
        var authority = new MotionAuthority(
            Guid.NewGuid(),
            Guid.NewGuid(),
            1,
            2,
            ImmutableArray.Create(10, 11),
            ImmutableArray.Create("r1"),
            ImmutableArray.Create(2),
            1,
            1,
            "hash");
        outbox.Publish(new TrafficEvent(
            TrafficEventKind.AuthorityGranted,
            authority.RobotId,
            "RBT-001",
            authority,
            null,
            null,
            null,
            1,
            2,
            0,
            null,
            true));

        await using var enumerator = outbox.ReadAllAsync(CancellationToken.None).GetAsyncEnumerator();
        Assert.True(await enumerator.MoveNextAsync());
        Assert.Equal(TrafficEventKind.AuthorityGranted, enumerator.Current.Kind);
        Assert.True(enumerator.Current.IsFirstSegment);
    }

    [Fact]
    public void SegmentedCoordinator_Constructs_WithOutbox()
    {
        var opts = Microsoft.Extensions.Options.Options.Create(new TrafficOptions
        {
            Mode = TrafficCoordinatorMode.Active
        });
        var coordinator = new SegmentedTrafficCoordinator(
            opts,
            new TrafficEventOutbox(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<SegmentedTrafficCoordinator>.Instance);
        Assert.Equal(1, coordinator.Epoch);
    }
}

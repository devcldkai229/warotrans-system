using System.Collections.Immutable;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// A Semantic grant used to be issued once and never refreshed: the renew tick bailed out
/// for every mode but Active, and the unchanged-plan-revision branch returned the existing
/// authority without emitting anything. A robot that stopped producing new plan revisions
/// — one holding still at its goal — therefore aged out of its own authority mid-run and
/// the motion gate closed on it.
/// </summary>
public class SemanticAuthorityRenewTests
{
    private static SemanticTrafficPolicy Policy() =>
        new(
            "fp-renew",
            Guid.NewGuid(),
            "MAP-ONE-V001",
            CellSizeMeters: 0.5,
            HorizonMeters: 4.0,
            FootprintHalfLength: 0.18,
            FootprintHalfWidth: 0.15,
            [],
            []);

    private static ImmutableArray<SemanticPlanPose> Plan() =>
        ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(1, 0, 0));

    private static SemanticPlanProposeRequest Propose(Guid robotId, string fingerprint, long revision) =>
        new(Guid.NewGuid(), robotId, "RBT-1", fingerprint, revision, Plan(), null, null, null);

    private static SegmentedTrafficCoordinator Coordinator(TrafficCoordinatorMode mode) =>
        new(
            Options.Create(new TrafficOptions { Mode = mode, EventLogCapacity = 64 }),
            new TrafficEventOutbox(),
            NullLogger<SegmentedTrafficCoordinator>.Instance);

    [Fact]
    public async Task Semantic_mode_renews_the_granted_authority()
    {
        var coordinator = Coordinator(TrafficCoordinatorMode.Semantic);
        var policy = Policy();
        Assert.True((await coordinator.BindSemanticPolicyAsync(policy)).Ok);

        var robotId = Guid.NewGuid();
        var grant = await coordinator.AcquireSemanticPlanAsync(
            Propose(robotId, policy.SemanticMapFingerprint, 1));
        Assert.True(grant.Granted);

        // Was 0: the tick returned early for anything that was not Active mode.
        Assert.Equal(1, await coordinator.RenewAllActiveAuthoritiesAsync());
    }

    [Fact]
    public async Task Shadow_mode_still_renews_nothing()
    {
        var coordinator = Coordinator(TrafficCoordinatorMode.Shadow);
        Assert.Equal(0, await coordinator.RenewAllActiveAuthoritiesAsync());
    }

    [Fact]
    public async Task Active_mode_renew_tick_is_unchanged()
    {
        // Active holds no semantic policy, so there is nothing to renew — the point is that
        // the tick still runs its segmented EXTEND retry without throwing.
        var coordinator = Coordinator(TrafficCoordinatorMode.Active);
        Assert.Equal(0, await coordinator.RenewAllActiveAuthoritiesAsync());
    }

    [Fact]
    public void Unchanged_plan_revision_refreshes_the_expiry()
    {
        var clock = new FakeTimeProvider();
        var options = new TrafficOptions
        {
            Mode = TrafficCoordinatorMode.Semantic,
            EventLogCapacity = 64,
            AuthorityTtlSec = 30
        };
        var state = new TrafficState(options, clock);
        state.BeginEpoch(1);
        var policy = Policy();
        Assert.True(state.BindSemanticPolicy(policy).Ok);

        var grantedAt = clock.GetUtcNow();
        var robotId = Guid.NewGuid();
        var first = state.AcquireSemanticPlan(Propose(robotId, policy.SemanticMapFingerprint, 7));
        Assert.True(first.Granted);
        Assert.Contains(state.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityGranted);
        var firstSeq = first.Authority!.Seq;
        // A grant event leaves ExpiresAt null and TrafficAuthorityPublisher fills in the TTL,
        // so the deadline the robot is actually holding is grantedAt + AuthorityTtlSec.
        var firstDeadline = grantedAt.AddSeconds(options.AuthorityTtlSec);

        // The robot is holding still: it keeps republishing the same plan revision.
        clock.Advance(TimeSpan.FromSeconds(20));
        var again = state.AcquireSemanticPlan(Propose(robotId, policy.SemanticMapFingerprint, 7));
        Assert.True(again.Granted);

        var renewed = state.DrainEvents().Where(e => e.Kind == TrafficEventKind.AuthorityRenewed).ToList();
        Assert.NotEmpty(renewed);
        // The deadline has to move past the original one, otherwise the grant lapses under a
        // robot that is still being held by it.
        Assert.NotNull(renewed[^1].ExpiresAt);
        Assert.True(renewed[^1].ExpiresAt > firstDeadline);
        Assert.True(renewed[^1].Authority.Seq > firstSeq);
    }

    [Fact]
    public void Changed_plan_revision_still_re_acquires()
    {
        var options = new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64 };
        var state = new TrafficState(options);
        state.BeginEpoch(1);
        var policy = Policy();
        Assert.True(state.BindSemanticPolicy(policy).Ok);

        var robotId = Guid.NewGuid();
        Assert.True(state.AcquireSemanticPlan(Propose(robotId, policy.SemanticMapFingerprint, 1)).Granted);
        state.DrainEvents();

        var next = state.AcquireSemanticPlan(Propose(robotId, policy.SemanticMapFingerprint, 2));
        Assert.True(next.Granted);
        Assert.Equal(2, next.Authority!.PlanRevision);
        Assert.Contains(state.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityGranted);
    }
}

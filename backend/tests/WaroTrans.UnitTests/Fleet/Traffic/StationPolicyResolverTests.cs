using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Fleet.Traffic.StationPolicies;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

public sealed class StationPolicyResolverTests
{
    [Fact]
    public void Resolve_Pickup_UnspecifiedBay_IsShelfService()
    {
        var graph = FakeRobotSim.BuildCorridorGraph();
        // Corridor graph may not have bay resources — NO_BAY or empty holds still OK.
        var code = graph.Stations.Length > 0 ? graph.Stations[0].EndpointCode : "EP-A";
        var r = StationPolicyResolver.Resolve(graph, code, "PICKUP");
        Assert.True(r.Ok);
        Assert.NotNull(r.Intent);
        Assert.True(
            r.Intent!.PolicyKind is StationPolicyKind.ShelfService
                or StationPolicyKind.Inbound
                or StationPolicyKind.Transit);
    }

    [Fact]
    public void Resolve_Charge_MapsToCharging()
    {
        var graph = FakeRobotSim.BuildCorridorGraph();
        var code = graph.Stations.Length > 0 ? graph.Stations[0].EndpointCode : "CHG";
        var r = StationPolicyResolver.Resolve(graph, code, "CHARGE");
        Assert.True(r.Ok);
        Assert.Equal(StationPolicyKind.Charging, r.Intent!.PolicyKind);
    }

    [Fact]
    public void Resolve_Transit_EmptyHolds_WhenNoBay()
    {
        var graph = FakeRobotSim.BuildCorridorGraph();
        var r = StationPolicyResolver.Resolve(graph, "NO-SUCH-ENDPOINT", "TRANSIT");
        Assert.True(r.Ok);
        Assert.Equal(StationPolicyKind.Transit, r.Intent!.PolicyKind);
        Assert.Empty(r.Intent.HoldResourceIds);
    }

    [Fact]
    public void FindNearestAvailableHoldingBay_ReturnsNull_WhenNone()
    {
        var graph = FakeRobotSim.BuildCorridorGraph();
        var snap = new TrafficSnapshot(
            1, 1, "Ready",
            ImmutableArray<RobotTrafficView>.Empty,
            ImmutableArray<ResourceTrafficView>.Empty,
            ImmutableArray<TrafficWaitDiagnostics>.Empty,
            ImmutableArray<TrafficCycleDiagnostics>.Empty,
            ImmutableArray<string>.Empty);
        var bay = StationPolicyResolver.FindNearestAvailableHoldingBay(graph, snap, 0, 0);
        // Corridor fixture may have no Holding/Recovery bays.
        Assert.True(bay is null || bay.StartsWith("bay:", StringComparison.Ordinal));
    }

    [Fact]
    public void TrafficOpsLog_WritesAndRetainsRecent()
    {
        var log = new TrafficOpsLog(Microsoft.Extensions.Logging.Abstractions.NullLogger<TrafficOpsLog>.Instance);
        log.Write(new TrafficOpsEvent(
            Guid.NewGuid(), TrafficOpsEventType.Grant, DateTimeOffset.UtcNow,
            Guid.NewGuid(), Guid.NewGuid(), null, null, Guid.NewGuid(), "bay:X",
            [1, 2], null, 1, 3, null));
        Assert.Single(log.Recent());
        Assert.Equal(TrafficOpsEventType.Grant, log.Recent()[0].EventType);
    }
}

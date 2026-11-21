using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.UnitTests.WorkflowExecution.Services;

public sealed class FreeEndpointSelectorTests
{
    private static readonly EndpointPoseWithType ParkA = Park("EP-PARKING-A", 0, 0);
    private static readonly EndpointPoseWithType ParkB = Park("EP-PARKING-B", 10, 0);

    private static EndpointPoseWithType Park(string code, double x, double y, bool enabled = true) =>
        new(Guid.NewGuid(), code, code, EndpointType.PARK, enabled, x, y, 0.06);

    private static Guid? Pick(
        (double, double) robot,
        EndpointSelectionPolicy policy,
        IReadOnlySet<Guid>? taken = null,
        params (double, double)[] others) =>
        FreeEndpointSelector.Pick(robot, [ParkA, ParkB], policy, taken ?? new HashSet<Guid>(), others, 0.30);

    [Fact]
    public void Nearest_takes_the_closest_free_member()
    {
        Assert.Equal(ParkB.Id, Pick((9, 0), EndpointSelectionPolicy.NEAREST));
        Assert.Equal(ParkA.Id, Pick((1, 0), EndpointSelectionPolicy.NEAREST));
    }

    [Fact]
    public void First_available_keeps_the_group_order_whatever_the_distance()
    {
        Assert.Equal(ParkA.Id, Pick((9, 0), EndpointSelectionPolicy.FIRST_AVAILABLE));
    }

    [Fact]
    public void A_member_another_robot_stands_on_or_heads_to_is_skipped()
    {
        Assert.Equal(ParkB.Id, Pick((1, 0), EndpointSelectionPolicy.NEAREST, null, (0.2, 0.1)));
        Assert.Equal(ParkB.Id, Pick((1, 0), EndpointSelectionPolicy.FIRST_AVAILABLE, new HashSet<Guid> { ParkA.Id }));
    }

    [Fact]
    public void Nothing_when_every_member_is_taken_or_disabled()
    {
        Assert.Null(Pick((1, 0), EndpointSelectionPolicy.NEAREST, new HashSet<Guid> { ParkA.Id }, (10, 0)));
        Assert.Null(FreeEndpointSelector.Pick((0, 0), [Park("EP-OFF", 0, 0, enabled: false)], EndpointSelectionPolicy.NEAREST,
            new HashSet<Guid>(), [], 0.30));
    }
}

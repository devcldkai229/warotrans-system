using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.Dispatch;

namespace WaroTrans.UnitTests.Fleet.Features.Dispatch;

/// <summary>FL-01 / HW-04: why a robot is (not) eligible, and how candidates are ranked.</summary>
public sealed class DispatchEligibilityTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 8, 10, 0, 0, TimeSpan.Zero);
    private static readonly Guid Map = Guid.NewGuid();
    private static readonly BatteryOptions Battery = new();
    private static readonly DispatchOptions Weights = new();

    private static Robot Ready(string code = "RBT-1", decimal battery = 80m, double x = 0, double y = 0)
    {
        var robot = Robot.Register(Guid.NewGuid(), Map, code, code, Now.AddDays(-1));
        robot.IsOnline = true;
        robot.Status = RobotStatus.AVAILABLE;
        robot.LocalizationStatus = LocalizationStatus.LOCALIZED;
        robot.BatteryPercent = battery;
        robot.BatteryMeasuredAt = Now.AddSeconds(-2);
        robot.PoseX = x;
        robot.PoseY = y;
        return robot;
    }

    private static DispatchCandidate Evaluate(Robot robot, double? px = null, double? py = null, ISet<Guid>? busy = null, BatteryOptions? battery = null) =>
        DispatchEligibility.Evaluate(robot, new DispatchQuery(Map, px, py, new HashSet<Guid>(busy ?? new HashSet<Guid>())), Now, null, battery ?? Battery, Weights);

    [Theory]
    [InlineData(RobotStatus.RESERVED)]
    [InlineData(RobotStatus.EXECUTING)]
    public void FL08_a_robot_only_driving_to_parking_is_offered_and_another_busy_robot_is_not(RobotStatus status)
    {
        var parking = Ready();
        parking.Status = status;
        var busy = Ready("RBT-2");
        busy.Status = status;
        var query = new DispatchQuery(Map, null, null, new HashSet<Guid>());

        var offered = DispatchEligibility.Evaluate(parking, query, Now, null, Battery, Weights, returningToPark: true);
        var refused = DispatchEligibility.Evaluate(busy, query, Now, null, Battery, Weights);

        Assert.True(offered.Eligible, string.Join(",", offered.Reasons));
        Assert.Contains(offered.Notes, n => n.StartsWith("returning_to_park", StringComparison.Ordinal));
        Assert.Contains(DispatchReasons.NotAvailable, refused.Reasons);
    }

    [Fact]
    public void FL08_returning_to_park_does_not_excuse_anything_else()
    {
        var robot = Ready();
        robot.Status = RobotStatus.EXECUTING;
        robot.MotionHeld = true;
        robot.LocalizationStatus = LocalizationStatus.LOST;

        var candidate = DispatchEligibility.Evaluate(robot, new DispatchQuery(Map, null, null, new HashSet<Guid>()), Now, null, Battery, Weights,
            returningToPark: true);

        Assert.False(candidate.Eligible);
        Assert.Contains(DispatchReasons.MotionHeld, candidate.Reasons);
        Assert.Contains(DispatchReasons.NotLocalized, candidate.Reasons);
        Assert.DoesNotContain(DispatchReasons.NotAvailable, candidate.Reasons);
    }

    [Fact]
    public void A_ready_robot_is_eligible()
    {
        var candidate = Evaluate(Ready());

        Assert.True(candidate.Eligible);
        Assert.Empty(candidate.Reasons);
        Assert.Equal("OK", candidate.BatteryState);
    }

    [Fact]
    public void A_robot_that_never_reported_its_battery_is_unknown_not_empty_and_only_overridable()
    {
        var robot = Ready();
        robot.BatteryMeasuredAt = null;
        robot.BatteryPercent = 0m;

        var candidate = Evaluate(robot);

        Assert.False(candidate.Eligible);
        Assert.Equal([DispatchReasons.BatteryUnknown], candidate.Reasons);
        Assert.Null(candidate.BatteryPercent);
        Assert.True(candidate.Overridable);
    }

    [Fact]
    public void Unknown_battery_dispatch_can_be_allowed_by_configuration()
    {
        var robot = Ready();
        robot.BatteryMeasuredAt = null;

        Assert.True(Evaluate(robot, battery: new BatteryOptions { AllowUnknownBatteryDispatch = true }).Eligible);
    }

    [Fact]
    public void An_old_reading_is_stale()
    {
        var robot = Ready();
        robot.BatteryMeasuredAt = Now.AddMinutes(-5);

        var candidate = Evaluate(robot);

        Assert.Equal("STALE", candidate.BatteryState);
        Assert.Contains(DispatchReasons.BatteryStale, candidate.Reasons);
    }

    [Fact]
    public void A_low_battery_is_never_overridable()
    {
        var candidate = Evaluate(Ready(battery: 25m));

        Assert.Equal([DispatchReasons.BatteryLow], candidate.Reasons);
        Assert.False(candidate.Overridable);
    }

    [Fact]
    public void Every_safety_reason_is_listed()
    {
        var robot = Ready();
        robot.Status = RobotStatus.MAINTENANCE;
        robot.MotionHeld = true;
        robot.LocalizationStatus = LocalizationStatus.LOST;

        var candidate = Evaluate(robot, busy: new HashSet<Guid> { robot.Id });

        Assert.Equal(
            [DispatchReasons.InMaintenance, DispatchReasons.MotionHeld, DispatchReasons.NotLocalized, DispatchReasons.Busy],
            candidate.Reasons);
        Assert.False(candidate.Overridable);
    }

    [Fact]
    public void The_nearest_robot_ranks_first_and_ineligible_robots_last()
    {
        var near = Ready("RBT-NEAR", 60m, x: 1, y: 0);
        var far = Ready("RBT-FAR", 95m, x: 20, y: 0);
        var held = Ready("RBT-HELD", 99m, x: 0, y: 0);
        held.MotionHeld = true;

        var ranked = DispatchEligibility.Rank([Evaluate(far, 0, 0), Evaluate(held, 0, 0), Evaluate(near, 0, 0)]);

        Assert.Equal(["RBT-NEAR", "RBT-FAR", "RBT-HELD"], ranked.Select(c => c.RobotCode));
        Assert.Equal(1.0, ranked[0].DistanceMeters);
    }
}

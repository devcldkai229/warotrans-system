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

    [Theory]
    [InlineData("MAP-ONE-V013", "MAP-ONE-V013", true)]
    [InlineData("map-one-v013", "MAP-ONE-V013", true)]   // case does not matter
    [InlineData(null, "MAP-ONE-V013", true)]             // a robot that sends no map code is not refused
    [InlineData("MAP-ONE-V013", null, true)]             // nothing to compare with
    [InlineData("MAP-ONE-V009", "MAP-ONE-V013", false)]  // runs another bundle: never sent, not overridable
    public void A_robot_running_another_map_than_the_jobs_is_refused(string? reported, string? jobMap, bool eligible)
    {
        var robot = Ready();
        robot.MapVersionCode = reported;

        var candidate = DispatchEligibility.Evaluate(
            robot, new DispatchQuery(Map, null, null, new HashSet<Guid>()) { MapVersionCode = jobMap }, Now, null, Battery, Weights);

        Assert.Equal(eligible, candidate.Eligible);
        Assert.Equal(!eligible, candidate.Reasons.Contains(DispatchReasons.ReportedMapMismatch));
        Assert.False(candidate.Overridable);
    }

    [Fact]
    public void A_robot_reporting_a_fault_is_refused_until_it_clears()
    {
        var robot = Ready();
        robot.ErrorCode = "LIDAR_TIMEOUT";

        var faulted = Evaluate(robot);
        Assert.False(faulted.Eligible);
        Assert.Contains(DispatchReasons.Faulted, faulted.Reasons);
        Assert.True(DispatchReasons.IsRobotReported(DispatchReasons.Faulted));
        Assert.False(faulted.Overridable);

        robot.ErrorCode = null;
        Assert.True(Evaluate(robot).Eligible);
    }

    [Fact]
    public void A_wider_robot_than_the_traffic_footprint_is_refused_and_the_shared_footprint_covers_both_robots()
    {
        var rbt2 = Ready("RBT-002");
        rbt2.LengthM = 0.30;
        rbt2.WidthM = 0.263;
        var query = new DispatchQuery(Map, null, null, new HashSet<Guid>());
        var old = new WaroTrans.Navigation.Traffic.TrafficFootprintOptions { LengthMeters = 0.32, WidthMeters = 0.26 };
        var shared = new WaroTrans.Navigation.Traffic.TrafficFootprintOptions { LengthMeters = 0.32, WidthMeters = 0.27 };

        Assert.Contains(DispatchReasons.LargerThanTrafficFootprint,
            DispatchEligibility.Evaluate(rbt2, query, Now, null, Battery, Weights, old).Reasons);
        Assert.True(DispatchEligibility.Evaluate(rbt2, query, Now, null, Battery, Weights, shared).Eligible);
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

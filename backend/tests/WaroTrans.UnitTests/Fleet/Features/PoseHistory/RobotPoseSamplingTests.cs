using WaroTrans.Fleet.Features.PoseHistory;

namespace WaroTrans.UnitTests.Fleet.Features.PoseHistory;

public sealed class RobotPoseSamplingTests
{
    private static readonly RobotHistoryOptions Options = new()
    {
        MinDistanceMeters = 0.25,
        MinHeadingChangeRad = 0.35,
        MaxIntervalSeconds = 10
    };

    private static readonly DateTimeOffset T0 = new(2026, 11, 13, 8, 0, 0, TimeSpan.Zero);

    private static PoseReading At(double x, double y = 0, double yaw = 0, double v = 0.2, double w = 0, double seconds = 0, string map = "MAP-V1") =>
        new(x, y, yaw, v, w, map, T0.AddSeconds(seconds));

    [Fact]
    public void The_first_reading_of_a_robot_is_kept() =>
        Assert.True(RobotPoseSampling.ShouldKeep(null, false, At(0), Options));

    [Theory]
    [InlineData(0.10, false)]
    [InlineData(0.24, false)]
    [InlineData(0.25, true)]
    [InlineData(1.00, true)]
    public void A_point_is_kept_once_the_robot_is_far_enough_from_the_last_one(double x, bool kept) =>
        Assert.Equal(kept, RobotPoseSampling.ShouldKeep(At(0), true, At(x, seconds: 1), Options));

    [Fact]
    public void Turning_on_the_spot_is_kept()
    {
        Assert.False(RobotPoseSampling.ShouldKeep(At(0), true, At(0, yaw: 0.2, v: 0, w: 0.5, seconds: 1), Options));
        Assert.True(RobotPoseSampling.ShouldKeep(At(0), true, At(0, yaw: 0.4, v: 0, w: 0.5, seconds: 1), Options));
    }

    [Fact]
    public void Heading_across_plus_minus_pi_is_the_short_way_round()
    {
        Assert.Equal(0.2, RobotPoseSampling.HeadingChange(3.04, -3.04), 1);
        Assert.False(RobotPoseSampling.ShouldKeep(At(0, yaw: 3.1), true, At(0.05, yaw: -3.1, seconds: 1), Options));
    }

    [Fact]
    public void A_slow_robot_still_gets_a_point_every_interval()
    {
        Assert.False(RobotPoseSampling.ShouldKeep(At(0), true, At(0.05, v: 0.02, seconds: 9), Options));
        Assert.True(RobotPoseSampling.ShouldKeep(At(0), true, At(0.05, v: 0.02, seconds: 10), Options));
    }

    [Fact]
    public void A_robot_standing_still_adds_nothing()
    {
        Assert.False(RobotPoseSampling.ShouldKeep(At(0, v: 0), false, At(0.001, v: 0, seconds: 60), Options));
        Assert.False(RobotPoseSampling.ShouldKeep(At(0, v: 0), false, At(0.001, v: 0, seconds: 3600), Options));
    }

    [Fact]
    public void Where_the_robot_stops_is_kept_once()
    {
        // Moving, 0.1 m past the last point, then stops there: that stop is the end of the path.
        Assert.True(RobotPoseSampling.ShouldKeep(At(0), true, At(0.1, v: 0, seconds: 1), Options));
        // Already standing (the stop was kept): nothing more.
        Assert.False(RobotPoseSampling.ShouldKeep(At(0.1, v: 0), false, At(0.1, v: 0, seconds: 2), Options));
        // Stopping exactly on the last point needs no second one.
        Assert.False(RobotPoseSampling.ShouldKeep(At(0), true, At(0.01, v: 0, seconds: 1), Options));
    }

    [Fact]
    public void A_new_map_starts_a_new_point() =>
        Assert.True(RobotPoseSampling.ShouldKeep(At(0), true, At(0.01, seconds: 1, map: "MAP-V2"), Options));

    [Theory]
    [InlineData(10, 4, new[] { 0, 3, 6, 9 })]
    [InlineData(5, 5, new[] { 0, 1, 2, 3, 4 })]
    [InlineData(100, 2, new[] { 0, 99 })]
    public void Downsampling_spreads_points_evenly_and_keeps_both_ends(int count, int limit, int[] expected) =>
        Assert.Equal(expected, GetRobotPoseHistoryHandler.Pick(count, limit));
}

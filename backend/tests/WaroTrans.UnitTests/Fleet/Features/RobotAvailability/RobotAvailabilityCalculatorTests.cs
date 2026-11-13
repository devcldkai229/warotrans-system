using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.RobotAvailability;

namespace WaroTrans.UnitTests.Fleet.Features.RobotAvailability;

/// <summary>A 10-hour window, 08:00 – 18:00, so every share below can be checked in hours.</summary>
public class RobotAvailabilityCalculatorTests
{
    private static readonly DateTimeOffset Start = new(2026, 11, 2, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset End = Start.AddHours(10);

    private static DateTimeOffset At(double hours) => Start.AddHours(hours);

    private static RobotStateChange Change(double hours, RobotStatus from, RobotStatus to, string reason) =>
        new(At(hours), from, to, reason);

    private static double Hours(double seconds) => seconds / 3600;

    [Fact]
    public void Replays_the_changes_inside_the_window()
    {
        var history = new[]
        {
            Change(-5, RobotStatus.OFFLINE, RobotStatus.AVAILABLE, "status,online"),
            Change(2, RobotStatus.AVAILABLE, RobotStatus.EXECUTING, "status"),
            Change(5, RobotStatus.EXECUTING, RobotStatus.AVAILABLE, "status"),
            Change(7, RobotStatus.AVAILABLE, RobotStatus.AVAILABLE, "offline"),
            Change(8, RobotStatus.AVAILABLE, RobotStatus.AVAILABLE, "online")
        };

        var totals = RobotAvailabilityCalculator.Measure(Start, End, history, RobotStatus.AVAILABLE, true);

        Assert.Equal(10, Hours(totals.CoveredSeconds));
        Assert.Equal(9, Hours(totals.OnlineSeconds));
        Assert.Equal(6, Hours(totals.Seconds(RobotStatus.AVAILABLE)));    // 08–10, 13–15, 16–18
        Assert.Equal(3, Hours(totals.Seconds(RobotStatus.EXECUTING)));
        Assert.Equal(1, Hours(totals.Seconds(RobotStatus.OFFLINE)));      // AVAILABLE but not connected
        Assert.Equal(9, Hours(totals.AvailableSeconds));
        Assert.Equal(3, Hours(totals.BusySeconds));
    }

    [Fact]
    public void Without_a_change_before_the_window_the_first_change_tells_what_it_was()
    {
        // The history before the window was removed: the robot went from CHARGING to AVAILABLE at 12:00, and came online
        // at 09:00, so it was CHARGING and offline at 08:00.
        var history = new[]
        {
            Change(1, RobotStatus.CHARGING, RobotStatus.CHARGING, "online"),
            Change(4, RobotStatus.CHARGING, RobotStatus.AVAILABLE, "status")
        };

        var totals = RobotAvailabilityCalculator.Measure(Start, End, history, RobotStatus.AVAILABLE, true);

        Assert.Equal(1, Hours(totals.Seconds(RobotStatus.OFFLINE)));
        Assert.Equal(3, Hours(totals.Seconds(RobotStatus.CHARGING)));
        Assert.Equal(6, Hours(totals.Seconds(RobotStatus.AVAILABLE)));
    }

    [Fact]
    public void A_change_after_the_window_still_tells_the_state_inside_it()
    {
        var history = new[] { Change(12, RobotStatus.MAINTENANCE, RobotStatus.AVAILABLE, "status") };

        var totals = RobotAvailabilityCalculator.Measure(Start, End, history, RobotStatus.AVAILABLE, false);

        // MAINTENANCE outranks the lost connection; the robot came online later, so it was offline the whole window.
        Assert.Equal(10, Hours(totals.Seconds(RobotStatus.MAINTENANCE)));
        Assert.Equal(0, totals.OnlineSeconds);
        Assert.Equal(0, totals.AvailableSeconds);
    }

    [Fact]
    public void With_no_change_at_all_the_robot_was_as_it_is_now()
    {
        var totals = RobotAvailabilityCalculator.Measure(Start, End, [], RobotStatus.AVAILABLE, true);

        Assert.Equal(10, Hours(totals.Seconds(RobotStatus.AVAILABLE)));
        Assert.Equal(10, Hours(totals.OnlineSeconds));
    }

    [Fact]
    public void A_change_exactly_at_the_start_counts_as_the_state_at_the_start()
    {
        var history = new[] { Change(0, RobotStatus.AVAILABLE, RobotStatus.ERROR, "status") };

        var totals = RobotAvailabilityCalculator.Measure(Start, End, history, RobotStatus.ERROR, true);

        Assert.Equal(10, Hours(totals.Seconds(RobotStatus.ERROR)));
        Assert.Equal(0, totals.AvailableSeconds);
    }

    [Fact]
    public void An_empty_window_has_nothing_to_measure()
    {
        var totals = RobotAvailabilityCalculator.Measure(End, Start, [], RobotStatus.AVAILABLE, true);

        Assert.Equal(0, totals.CoveredSeconds);
        Assert.Empty(totals.SecondsByStatus);
    }

    [Theory]
    [InlineData("status,online", true)]
    [InlineData("offline", false)]
    [InlineData("status,offline,motion_held", false)]
    [InlineData("motion_released", null)]
    [InlineData(null, null)]
    public void Reads_the_connection_change_from_the_reason(string? reason, bool? expected)
    {
        Assert.Equal(expected, new RobotStateChange(Start, null, RobotStatus.AVAILABLE, reason).Connectivity);
    }

    [Fact]
    public void Totals_add_up_over_robots()
    {
        var one = RobotAvailabilityCalculator.Measure(Start, End, [], RobotStatus.AVAILABLE, true);
        var two = RobotAvailabilityCalculator.Measure(Start, End, [], RobotStatus.EXECUTING, true);

        var fleet = one.Add(two);

        Assert.Equal(20, Hours(fleet.CoveredSeconds));
        Assert.Equal(10, Hours(fleet.BusySeconds));
        Assert.Equal(20, Hours(fleet.AvailableSeconds));
    }
}

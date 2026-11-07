using WaroTrans.Fleet.Battery;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.DispatchRobot;
using WaroTrans.Fleet.Features.Shared;

namespace WaroTrans.UnitTests.Fleet.Battery;

public class BatteryDispatchPolicyTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 6, 9, 0, 0, TimeSpan.Zero);

    private static Robot RobotWith(decimal? percent, int ageSeconds = 1, bool online = true, string code = "RBT-001") => new()
    {
        Id = Guid.NewGuid(),
        Code = code,
        Status = RobotStatus.AVAILABLE,
        IsEnabled = true,
        IsOnline = online,
        BatteryPercent = percent,
        BatteryUpdatedAt = percent is null ? null : Now.AddSeconds(-ageSeconds)
    };

    private static BatteryOptions Options(bool allowUnknown = false) =>
        new() { MinDispatchPercent = 30m, StaleAfterSeconds = 15, AllowUnknownBatteryDispatch = allowUnknown };

    [Fact]
    public void Fresh_known_battery_above_minimum_is_eligible()
    {
        var decision = BatteryDispatchPolicy.Evaluate(RobotWith(64m), Now, Options());
        Assert.Equal(BatteryDispatchStatus.ELIGIBLE, decision.Status);
        Assert.True(decision.Allowed);
        Assert.False(decision.IsStale);
    }

    [Fact]
    public void Unknown_battery_is_blocked_in_production()
    {
        var decision = BatteryDispatchPolicy.Evaluate(RobotWith(null), Now, Options());
        Assert.Equal(BatteryDispatchStatus.UNKNOWN, decision.Status);
        Assert.False(decision.Allowed);
    }

    [Theory]
    [InlineData(16, true)]   // older than StaleAfterSeconds
    [InlineData(1, false)]   // robot offline
    public void Stale_battery_is_blocked_in_production(int ageSeconds, bool online)
    {
        var decision = BatteryDispatchPolicy.Evaluate(RobotWith(80m, ageSeconds, online), Now, Options());
        Assert.Equal(BatteryDispatchStatus.STALE, decision.Status);
        Assert.False(decision.Allowed);
        Assert.True(decision.IsStale);
    }

    [Fact]
    public void Known_low_battery_is_blocked()
    {
        var decision = BatteryDispatchPolicy.Evaluate(RobotWith(29.9m), Now, Options());
        Assert.Equal(BatteryDispatchStatus.LOW, decision.Status);
        Assert.False(decision.Allowed);
    }

    [Fact]
    public void Development_override_allows_unknown_and_stale_only()
    {
        var options = Options(allowUnknown: true);
        Assert.True(BatteryDispatchPolicy.Evaluate(RobotWith(null), Now, options).Allowed);
        Assert.True(BatteryDispatchPolicy.Evaluate(RobotWith(80m, ageSeconds: 60), Now, options).Allowed);
        Assert.False(BatteryDispatchPolicy.Evaluate(RobotWith(10m), Now, options).Allowed);
        // A known low SOC stays LOW even when stale: the override never lets it through.
        var staleLow = BatteryDispatchPolicy.Evaluate(RobotWith(10m, ageSeconds: 60), Now, options);
        Assert.Equal(BatteryDispatchStatus.LOW, staleLow.Status);
        Assert.False(staleLow.Allowed);
    }

    [Fact]
    public void Battery_response_reports_unknown_not_zero()
    {
        var response = RobotBatteryResponse.From(RobotWith(null), Options(), Now);
        Assert.Null(response.Percent);
        Assert.Equal(BatteryEstimationMode.UNAVAILABLE, response.EstimationMode);
        Assert.Equal(BatteryChargingState.UNKNOWN, response.ChargingState);
        Assert.Equal(BatteryDispatchStatus.UNKNOWN, response.DispatchStatus);
        Assert.True(response.IsStale);
    }

    [Fact]
    public void Selector_orders_known_battery_first_and_unknown_last()
    {
        var unknown = RobotWith(null, code: "RBT-001");
        var low = RobotWith(15m, code: "RBT-002");
        var high = RobotWith(80m, code: "RBT-003");
        Assert.Same(high, DispatchRobotSelector.Select([unknown, low, high]));
        Assert.Same(low, DispatchRobotSelector.Select([unknown, low]));
    }
}

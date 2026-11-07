using WaroTrans.Fleet.Battery;

namespace WaroTrans.UnitTests.Fleet.Battery;

public class BatteryAlertRulesTests
{
    private static readonly BatteryOptions Options = new()
    {
        LowPercent = 20m,
        CriticalPercent = 10m,
        RecoverHysteresisPercent = 5m
    };

    [Theory]
    [InlineData(21.0, 20.0, BatteryAlertTransition.LOW)]
    [InlineData(25.0, 9.0, BatteryAlertTransition.CRITICAL)]
    [InlineData(11.0, 10.0, BatteryAlertTransition.CRITICAL)]
    [InlineData(20.0, 19.0, BatteryAlertTransition.NONE)]     // already low: no repeat
    [InlineData(9.0, 8.0, BatteryAlertTransition.NONE)]       // already critical: no repeat
    [InlineData(18.0, 26.0, BatteryAlertTransition.RECOVERED)]
    [InlineData(18.0, 24.0, BatteryAlertTransition.NONE)]     // inside the hysteresis band
    [InlineData(60.0, 59.0, BatteryAlertTransition.NONE)]
    public void Raises_once_per_band_and_recovers_with_hysteresis(double before, double after, BatteryAlertTransition expected)
    {
        Assert.Equal(expected, BatteryAlertRules.Evaluate((decimal)before, (decimal)after, Options));
    }

    [Fact]
    public void Unknown_battery_never_raises_an_alert()
    {
        Assert.Equal(BatteryAlertTransition.NONE, BatteryAlertRules.Evaluate(50m, null, Options));
        Assert.Equal(BatteryAlertTransition.NONE, BatteryAlertRules.Evaluate(null, null, Options));
    }

    [Fact]
    public void First_known_reading_inside_a_band_raises_it()
    {
        Assert.Equal(BatteryAlertTransition.LOW, BatteryAlertRules.Evaluate(null, 15m, Options));
        Assert.Equal(BatteryAlertTransition.CRITICAL, BatteryAlertRules.Evaluate(null, 5m, Options));
        Assert.Equal(BatteryAlertTransition.NONE, BatteryAlertRules.Evaluate(null, 80m, Options));
    }
}

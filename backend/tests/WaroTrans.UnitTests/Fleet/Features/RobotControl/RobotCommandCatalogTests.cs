using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.RobotControl;

namespace WaroTrans.UnitTests.Fleet.Features.RobotControl;

public class RobotCommandCatalogTests
{
    [Fact]
    public void A_stop_accepted_with_no_result_for_too_long_reads_unknown()
    {
        var now = DateTimeOffset.UtcNow;
        var stop = WaroTrans.Fleet.Entities.RobotCommand.CreateControl(Guid.NewGuid(), Guid.NewGuid(), RobotCommandType.STOP, "{}", now);
        stop.Status = RobotCommandStatus.ACKED;
        stop.AckedAt = now;

        Assert.Equal(StopStates.Accepted, RobotControlService.StateOf(stop, true, now.AddSeconds(5)));
        Assert.Equal(StopStates.Unknown, RobotControlService.StateOf(stop, true, now.AddSeconds(31)));
        Assert.Equal(StopStates.Accepted, RobotControlService.StateOf(stop, true));
    }
}

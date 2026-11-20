using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.IssueCancelCommand;

namespace WaroTrans.UnitTests.Fleet.Features.RobotControl;

/// <summary>
/// The robot reports it still drives a NAVIGATE the backend has closed: the backend tells it to stop, one CANCEL at a
/// time, and again if that CANCEL did not take — whatever outcome the closed NAVIGATE was given.
/// </summary>
public class CancelOrphanTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 20, 8, 0, 0, TimeSpan.Zero);
    private static readonly Guid Robot = Guid.NewGuid();

    private static RobotCommand ClosedNavigate(RobotCommandStatus status, TimeSpan closedAgo)
    {
        var cmd = RobotCommand.CreateNavigate(Robot, Guid.NewGuid(), "{}", Now - closedAgo - TimeSpan.FromSeconds(30), null, null);
        cmd.Status = status;
        cmd.Outcome = status.ToString();
        cmd.CompletedAt = Now - closedAgo;
        return cmd;
    }

    private static RobotCommand Cancel(RobotCommand target, RobotCommandStatus status, TimeSpan issuedAgo)
    {
        var cancel = RobotCommand.CreateCancel(Robot, Guid.NewGuid(), target.Id, "{}", Now - issuedAgo, null, null);
        cancel.Status = status;
        return cancel;
    }

    [Fact]
    public void A_robot_still_driving_a_cancelled_navigate_is_told_to_stop() =>
        Assert.True(IssueCancelCommandHandler.OrphanCancelDue(
            ClosedNavigate(RobotCommandStatus.CANCELED, TimeSpan.FromSeconds(30)), [], Now));

    [Fact]
    public void No_cancel_for_a_navigate_still_open() =>
        Assert.False(IssueCancelCommandHandler.OrphanCancelDue(
            RobotCommand.CreateNavigate(Robot, Guid.NewGuid(), "{}", Now.AddMinutes(-1), null, null), [], Now));

    [Fact]
    public void No_cancel_right_after_the_navigate_closed() =>
        Assert.False(IssueCancelCommandHandler.OrphanCancelDue(
            ClosedNavigate(RobotCommandStatus.ABORTED, TimeSpan.FromSeconds(2)), [], Now));

    [Fact]
    public void One_cancel_at_a_time()
    {
        var target = ClosedNavigate(RobotCommandStatus.ABORTED, TimeSpan.FromSeconds(60));
        Assert.False(IssueCancelCommandHandler.OrphanCancelDue(
            target, [Cancel(target, RobotCommandStatus.SENT, TimeSpan.FromSeconds(30))], Now));
    }

    [Fact]
    public void No_second_cancel_within_the_grace_even_once_the_first_completed()
    {
        var target = ClosedNavigate(RobotCommandStatus.ABORTED, TimeSpan.FromSeconds(60));
        Assert.False(IssueCancelCommandHandler.OrphanCancelDue(
            target, [Cancel(target, RobotCommandStatus.COMPLETED, TimeSpan.FromSeconds(3))], Now));
    }

    [Theory]
    [InlineData(RobotCommandStatus.TIMEOUT)]
    [InlineData(RobotCommandStatus.FAILED)]
    [InlineData(RobotCommandStatus.COMPLETED)]
    public void A_cancel_that_did_not_stop_the_robot_is_sent_again(RobotCommandStatus earlier)
    {
        var target = ClosedNavigate(RobotCommandStatus.ABORTED, TimeSpan.FromSeconds(60));
        Assert.True(IssueCancelCommandHandler.OrphanCancelDue(
            target, [Cancel(target, earlier, TimeSpan.FromSeconds(30))], Now));
    }
}

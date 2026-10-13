using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.UnitTests.Fleet;

public class RobotCommandDomainTests
{
    [Fact]
    public void Ack_accept_then_duplicate_ignored()
    {
        var now = DateTimeOffset.UtcNow;
        var cmd = RobotCommand.CreateNavigate(Guid.NewGuid(), Guid.NewGuid(), "{}", now, null, null);
        Assert.True(cmd.TryApplyAck(true, null, now));
        Assert.Equal(RobotCommandStatus.RUNNING, cmd.Status);
        Assert.False(cmd.TryApplyAck(true, null, now.AddSeconds(1)));
    }

    [Fact]
    public void Result_idempotent()
    {
        var now = DateTimeOffset.UtcNow;
        var cmd = RobotCommand.CreateNavigate(Guid.NewGuid(), Guid.NewGuid(), "{}", now, null, null);
        Assert.True(cmd.TryApplyAck(true, null, now));
        Assert.True(cmd.TryApplyResult(RobotCommandOutcomes.Succeeded, null, now));
        Assert.Equal(RobotCommandStatus.COMPLETED, cmd.Status);
        Assert.False(cmd.TryApplyResult(RobotCommandOutcomes.Failed, "x", now));
    }

    [Fact]
    public void Ack_timeout_only_from_sent()
    {
        var now = DateTimeOffset.UtcNow;
        var cmd = RobotCommand.CreateNavigate(Guid.NewGuid(), Guid.NewGuid(), "{}", now, null, null);
        Assert.True(cmd.TryMarkAckTimeout(now));
        Assert.Equal(RobotCommandStatus.TIMEOUT, cmd.Status);
        Assert.False(cmd.TryMarkAckTimeout(now));
    }

    [Fact]
    public void JobAssignment_lifecycle()
    {
        var now = DateTimeOffset.UtcNow;
        var a = JobAssignment.CreatePending(Guid.NewGuid(), Guid.NewGuid(), now);
        Assert.True(a.TryAcknowledge(now));
        Assert.True(a.TryActivate(now));
        Assert.True(a.TryEnd(AssignmentEndReason.COMPLETED, now));
        Assert.False(a.TryEnd(AssignmentEndReason.FAILED, now));
    }
}

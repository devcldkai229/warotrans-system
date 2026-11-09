using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.Shared;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;

namespace WaroTrans.UnitTests.Transportation.Features;

/// <summary>BOTH-04: the server decides which actions a TR / Job offers, with a reason when it does not.</summary>
public sealed class ActionPolicyTests
{
    private static readonly Func<string, bool> Admin = p => RolePermissionMatrix.RoleHas(AppRoles.Admin, p);
    private static readonly Func<string, bool> Staff = p => RolePermissionMatrix.RoleHas(AppRoles.Staff, p);

    private static TransportRequest Request(TransportRequestStatus status)
    {
        var request = TransportRequest.Submit(
            "REQ-1", Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), null, null,
            [new TransportRequestDetailDraft(1, Guid.NewGuid(), null, Guid.NewGuid(), null, null, Guid.NewGuid(), null)],
            DateTimeOffset.UtcNow);
        request.Status = status;
        return request;
    }

    private static RequestJobState Job(string status) => new(Guid.NewGuid(), "JOB-1", status, Guid.NewGuid());

    private static ActionAvailability Find(IReadOnlyList<ActionAvailability> actions, string action) =>
        Assert.Single(actions, a => a.Action == action);

    [Fact]
    public void A_submitted_request_can_be_queued_cancelled_and_rejected_by_an_admin()
    {
        var actions = TransportRequestActionPolicy.Evaluate(Request(TransportRequestStatus.SUBMITTED), [], Admin);

        Assert.All(actions, a => Assert.True(a.Allowed, a.Action));
    }

    [Fact]
    public void Staff_see_cancel_and_reject_as_forbidden_not_hidden()
    {
        var actions = TransportRequestActionPolicy.Evaluate(Request(TransportRequestStatus.SUBMITTED), [], Staff);

        Assert.True(Find(actions, TransportRequestActionPolicy.Queue).Allowed);
        Assert.Equal(ActionAvailability.Forbidden, Find(actions, TransportRequestActionPolicy.Cancel).Reason);
        Assert.Equal(ActionAvailability.Forbidden, Find(actions, TransportRequestActionPolicy.Reject).Reason);
    }

    [Fact]
    public void A_queued_request_can_be_rejected_only_while_no_job_has_started()
    {
        var queued = Request(TransportRequestStatus.QUEUED);

        Assert.Null(TransportRequestActionPolicy.StateReason(TransportRequestActionPolicy.Reject, queued, [Job("QUEUED")]));
        Assert.Equal(
            "transport_request_already_running",
            TransportRequestActionPolicy.StateReason(TransportRequestActionPolicy.Reject, queued, [Job("QUEUED"), Job("RUNNING")]));
    }

    [Theory]
    [InlineData(TransportRequestStatus.COMPLETED, "transport_request_closed")]
    [InlineData(TransportRequestStatus.REJECTED, "transport_request_closed")]
    [InlineData(TransportRequestStatus.CANCELLING, "transport_request_cancelling")]
    [InlineData(TransportRequestStatus.IN_PROGRESS, null)]
    public void Cancel_depends_on_the_request_state(TransportRequestStatus status, string? reason)
    {
        Assert.Equal(reason, TransportRequestActionPolicy.StateReason(TransportRequestActionPolicy.Cancel, Request(status), []));
    }

    [Theory]
    [InlineData(JobStatus.RUNNING, JobActionPolicy.Pause, true)]
    [InlineData(JobStatus.RUNNING, JobActionPolicy.Resume, false)]
    [InlineData(JobStatus.PAUSED, JobActionPolicy.Resume, true)]
    [InlineData(JobStatus.QUEUED, JobActionPolicy.Start, true)]
    [InlineData(JobStatus.COMPLETED, JobActionPolicy.Cancel, false)]
    [InlineData(JobStatus.RECOVERY_REQUIRED, JobActionPolicy.Cancel, true)]
    public void Job_actions_follow_the_job_state(JobStatus status, string action, bool allowed)
    {
        Assert.Equal(allowed, Find(JobActionPolicy.Evaluate(status, Admin), action).Allowed);
    }

    [Fact]
    public void Staff_may_pause_but_not_cancel_a_running_job()
    {
        var actions = JobActionPolicy.Evaluate(JobStatus.RUNNING, Staff);

        Assert.True(Find(actions, JobActionPolicy.Pause).Allowed);
        Assert.Equal(ActionAvailability.Forbidden, Find(actions, JobActionPolicy.Cancel).Reason);
    }
}

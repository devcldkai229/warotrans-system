using Microsoft.AspNetCore.SignalR;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Host.Hubs;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Host.Realtime;

/// <summary>
/// Pushes Job execution progress (WorkflowExecution integration events) to web clients as "jobUpdated".
/// Clients refetch GET /api/workflow-execution/jobs/{jobId}; the event only says what changed.
/// </summary>
public sealed class SignalRJobRealtimeForwarder(IHubContext<NotificationsHub> hub)
    : IIntegrationEventHandler<JobStatusChanged>, IIntegrationEventHandler<JobStepStatusChanged>
{
    public Task HandleAsync(JobStatusChanged e, CancellationToken cancellationToken = default) =>
        hub.Clients.All.SendAsync(
            "jobUpdated",
            new { e.JobId, kind = "job", e.JobNo, e.Status, e.RobotId, e.FailureCode, e.OccurredAt },
            cancellationToken);

    public Task HandleAsync(JobStepStatusChanged e, CancellationToken cancellationToken = default) =>
        hub.Clients.All.SendAsync(
            "jobUpdated",
            new { e.JobId, kind = "step", e.JobStepId, e.StepKey, e.Status, e.ErrorCode, e.OccurredAt },
            cancellationToken);
}

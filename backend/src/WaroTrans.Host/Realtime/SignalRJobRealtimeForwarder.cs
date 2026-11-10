using Microsoft.AspNetCore.SignalR;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Host.Hubs;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.IntegrationEvents;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Host.Realtime;

/// <summary>
/// Pushes Job execution progress (WorkflowExecution integration events) to web clients as "jobUpdated".
/// Clients refetch GET /api/workflow-execution/jobs/{jobId}; the event only says what changed.
/// </summary>
public sealed class SignalRJobRealtimeForwarder(IHubContext<NotificationsHub> hub)
    : IIntegrationEventHandler<JobStatusChanged>,
        IIntegrationEventHandler<JobStepStatusChanged>,
        IIntegrationEventHandler<TransportRequestProgressed>,
        IIntegrationEventHandler<TransportRequestClosedByOperator>
{
    /// <summary>
    /// RTM-02: a request moved (a Detail changed, it was re-aggregated, cancelled or rejected). Sent after the commit;
    /// clients refetch GET /api/transportation/transport-requests/{id}, so a dropped event only delays the screen.
    /// </summary>
    public Task HandleAsync(TransportRequestProgressed e, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(RealtimeGroups.Jobs).SendAsync(
            "transportRequestUpdated",
            new
            {
                transportRequestId = e.RequestId,
                kind = e.ContainerId is null ? "request" : "detail",
                e.RequestCode,
                status = e.Status.ToString(),
                e.TotalDetails,
                e.CompletedDetails,
                e.FailedDetails,
                e.ContainerId,
                e.DetailStatus,
                e.OccurredAt
            },
            cancellationToken);

    public Task HandleAsync(TransportRequestClosedByOperator e, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(RealtimeGroups.Jobs).SendAsync(
            "transportRequestUpdated",
            new
            {
                transportRequestId = e.RequestId,
                kind = e.Status == TransportRequestStatus.REJECTED ? "rejected" : "cancelled",
                e.RequestCode,
                status = e.Status.ToString(),
                e.Reason,
                e.ContainersInRecovery,
                e.OccurredAt
            },
            cancellationToken);

    public Task HandleAsync(JobStatusChanged e, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(RealtimeGroups.Jobs).SendAsync(
            "jobUpdated",
            new { e.JobId, kind = "job", e.JobNo, e.Status, e.RobotId, e.FailureCode, e.OccurredAt },
            cancellationToken);

    public Task HandleAsync(JobStepStatusChanged e, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(RealtimeGroups.Jobs).SendAsync(
            "jobUpdated",
            new { e.JobId, kind = "step", e.JobStepId, e.StepKey, e.Status, e.ErrorCode, e.OccurredAt },
            cancellationToken);
}

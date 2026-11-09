using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Host.Realtime;

/// <summary>
/// Audit entries for business facts that are raised as integration events rather than by one endpoint (SY-05):
/// a container changing hands (assigned, onboard, delivered, failed, cancelled). The actor is whoever caused the event
/// in this request (Staff confirming a handover); robot-driven changes have no actor.
/// </summary>
public sealed class AuditEventRecorder(IAuditTrail audit) : IIntegrationEventHandler<JobContainerStatusChanged>
{
    public Task HandleAsync(JobContainerStatusChanged e, CancellationToken cancellationToken = default) =>
        audit.RecordAsync(
            new AuditEntry(
                "container.custody_changed",
                "CONTAINER",
                e.ContainerId,
                After: new Dictionary<string, object?> { ["status"] = e.Status },
                Context: new Dictionary<string, object?>
                {
                    ["jobId"] = e.JobId,
                    ["transportRequestId"] = e.TransportRequestId
                }),
            cancellationToken);
}

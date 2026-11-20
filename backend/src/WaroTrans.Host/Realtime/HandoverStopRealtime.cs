using Microsoft.AspNetCore.SignalR;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Host.Hubs;
using WaroTrans.Operations.Contracts;
using WaroTrans.Operations.Enums;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Host.Realtime;

internal sealed class HandoverStopRealtime(
    INotificationService notifications, IHubContext<NotificationsHub> hub, IStaffOperatingWarehouse staffWarehouse)
    : IIntegrationEventHandler<HandoverStopNotice>, IIntegrationEventHandler<HandoverStopQueueChanged>
{
    public async Task HandleAsync(HandoverStopNotice e, CancellationToken cancellationToken = default)
    {
        var (title, body) = e.Kind switch
        {
            HandoverStopNotice.Offer => ("Handover available", $"Accept the next handover of {e.JobNo}."),
            HandoverStopNotice.BeginReminder => ("Handover starts soon", $"Begin the handover of {e.JobNo} before your claim expires."),
            HandoverStopNotice.Unstarted => ("Handover waiting for Staff", $"The robot for {e.JobNo} is ready and Staff have not started."),
            _ => ("Handover overdue", $"The handover of {e.JobNo} still needs confirmation.")
        };
        var audience = e.ReceiverId is { } account
            ? NotificationAudience.Person(account)
            : e.Kind == HandoverStopNotice.Offer ? NotificationAudience.Floor
            : e.RobotId is { } robot ? NotificationAudience.RobotCare(robot) : NotificationAudience.Admins;
        await notifications.PublishAsync(new NotificationDraft(
            e.Kind == HandoverStopNotice.Offer ? NotificationType.ASSIGNMENT : NotificationType.WARNING,
            e.Kind, title, body, "JOB", e.JobId, $"handover:{e.StopId}:{e.MoveId}:{e.Version}:{e.Kind}:{e.ReceiverId}",
            OncePerSituation: true, Audience: audience with { WarehouseId = e.WarehouseId }), cancellationToken);
    }

    public async Task HandleAsync(HandoverStopQueueChanged e, CancellationToken cancellationToken = default)
    {
        var groups = new List<string> { RealtimeGroups.Role(AppRoles.Admin) };
        if (await staffWarehouse.GetOperatingWarehouseIdAsync(cancellationToken) == e.WarehouseId)
            groups.Add(RealtimeGroups.StaffWarehouse(e.WarehouseId));
        await hub.Clients.Groups(groups).SendAsync("handoverStopsChanged", new { e.JobId, e.StopId }, cancellationToken);
    }
}

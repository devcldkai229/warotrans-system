using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Execution;

internal sealed class HandoverStopNoticeHostedService(
    IServiceScopeFactory scopes, IOptions<HumanTaskOptions> options, TimeProvider clock, ILogger<HandoverStopNoticeHostedService> logger)
    : BackgroundService
{
    private readonly HashSet<(Guid MoveId, int Version, string Kind, Guid? ReceiverId)> _sent = [];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1), clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await PublishDueAsync(stoppingToken);
            }
            catch (Exception exception) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogWarning(exception, "Could not send scheduled handover notifications");
            }
        }
    }

    private async Task PublishDueAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var db = services.GetRequiredService<WorkflowExecutionDbContext>();
        var navigation = services.GetRequiredService<INavigationModule>();
        var operatingWarehouse = services.GetRequiredService<IStaffOperatingWarehouse>();
        var workZones = services.GetRequiredService<IStaffWorkZones>();
        var events = services.GetRequiredService<IIntegrationEventPublisher>();
        var settings = options.Value;
        var now = clock.GetUtcNow();
        var openBefore = now.AddSeconds(-Math.Max(settings.StopOfferDelaySeconds, 0));
        var jobs = await db.Jobs.AsNoTracking().Where(job => job.Status == JobStatus.RUNNING
                && job.JobTasks.Any(task => task.JobSteps.Any(step => step.MoveAcceptedAt <= openBefore
                    && (step.Status == JobStepStatus.EXECUTING || step.Status == JobStepStatus.COMPLETED))))
            .Include(job => job.JobTasks).ThenInclude(task => task.JobSteps).AsSplitQuery().ToListAsync(cancellationToken);
        if (jobs.Count == 0)
        {
            _sent.Clear();
            return;
        }

        var warehouse = await operatingWarehouse.GetOperatingWarehouseIdAsync(cancellationToken);
        var operations = await StopHandover.LoadOperationsAsync(db, jobs.Select(job => job.WorkflowId).Distinct().ToArray(), cancellationToken);
        var activeMoves = new HashSet<Guid>();
        foreach (var job in jobs)
        {
            var stop = StopHandover.Read(job, operations);
            if (stop is null || stop.OfferOpensAt(settings) > now) continue;
            var map = await navigation.GetMapVersionAsync(job.MapVersionId, cancellationToken);
            if (warehouse is null || map?.WarehouseId != warehouse) continue;

            activeMoves.Add(stop.MoveId);
            var task = stop.StopTask;
            var robotId = job.ContextValues.TryGetValue(JobExecutionEngine.AssignedRobotKey, out var value)
                && value.ValueKind == JsonValueKind.String && value.TryGetGuid(out var parsed) ? parsed : (Guid?)null;
            var owner = stop.OwnerAt(now, settings);
            if (owner is null)
            {
                var zones = await navigation.GetWorkZoneCodesAtEndpointAsync(stop.EndpointId, cancellationToken);
                if (now >= stop.WarehouseOpensAt(settings, zones.Count > 0))
                {
                    await SendAsync(HandoverStopNotice.Offer);
                }
                else
                {
                    var recipients = await workZones.GetStaffInZonesAsync(warehouse.Value, zones, cancellationToken);
                    foreach (var recipient in recipients)
                        await SendAsync(HandoverStopNotice.Offer, recipient);
                }
            }

            if (task.HandoverBeganAt is not null && task.HandoverWorkDeadline <= now)
            {
                await SendAsync(HandoverStopNotice.Overdue);
                if (owner is { } operatorId) await SendAsync(HandoverStopNotice.Overdue, operatorId);
            }
            else if (task.HandoverBeganAt is null && stop.ReadyAt is { } ready)
            {
                if (ready.AddSeconds(Math.Max(settings.StopUnstartedEscalationSeconds, 1)) <= now)
                    await SendAsync(HandoverStopNotice.Unstarted);
                if (owner is { } operatorId && stop.BeginDeadline(settings) is { } deadline
                    && deadline.AddSeconds(-Math.Max(settings.StopBeginReminderSeconds, 0)) <= now)
                    await SendAsync(HandoverStopNotice.BeginReminder, operatorId);
            }

            async Task SendAsync(string kind, Guid? receiver = null)
            {
                var key = (stop.MoveId, task.HandoverVersion, kind, receiver);
                if (_sent.Contains(key)) return;
                await events.PublishAsync(new HandoverStopNotice(
                    job.Id, job.JobNo, task.Id, stop.MoveId, task.HandoverVersion, warehouse.Value, robotId, kind, receiver), cancellationToken);
                _sent.Add(key);
            }
        }
        _sent.RemoveWhere(key => !activeMoves.Contains(key.MoveId));
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Contracts;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder.Features.Runs;
using WaroTrans.Evidence.Recorder.Services;

namespace WaroTrans.Evidence.Recorder.Features.Journals.ReconcileWithTransport;

/// <summary>
/// Keeps unfinished journals right when an event was lost: every <see cref="RecorderOptions.ReconcileIntervalSeconds"/>
/// it asks the source of truth for the request's trips and robot assignments and fills in missing or unfinished runs.
/// Every <see cref="RecorderOptions.MaintenanceIntervalSeconds"/> it also recomputes statuses that change with time
/// (an upload grace period running out).
/// </summary>
internal sealed class JournalMaintenanceService(
    IServiceScopeFactory scopes,
    IOptions<RecorderOptions> options,
    TimeProvider clock,
    ILogger<JournalMaintenanceService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Evidence journal maintenance failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(Math.Max(5, options.Value.MaintenanceIntervalSeconds)), clock, stoppingToken);
        }
    }

    internal async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EvidenceDbContext>();
        var statuses = scope.ServiceProvider.GetRequiredService<JournalStatusService>();
        var now = clock.GetUtcNow();
        var reconcileBefore = now.AddSeconds(-Math.Max(30, options.Value.ReconcileIntervalSeconds));
        var open = await db.Journals
            .Where(j => j.Status == EvidenceJournalStatus.OPEN || j.Status == EvidenceJournalStatus.FINALIZING)
            .OrderBy(j => j.LastReconciledAtUtc)
            .Take(200)
            .ToListAsync(cancellationToken);
        foreach (var journal in open)
        {
            if (journal.LastReconciledAtUtc is null || journal.LastReconciledAtUtc < reconcileBefore)
            {
                await ReconcileAsync(scope.ServiceProvider, journal, now, cancellationToken);
            }

            await statuses.RecomputeAsync(journal, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task ReconcileAsync(IServiceProvider services, EvidenceJournal journal, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var core = services.GetRequiredService<CoreApiClient>();
        var runs = services.GetRequiredService<RunUpserter>();
        SourceRequestRuns? source;
        try
        {
            source = await core.GetRequestRunsAsync(journal.TransportRequestId, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogDebug(ex, "Evidence: cannot reconcile {Request} now", journal.RequestCode);
            return;
        }

        journal.LastReconciledAtUtc = now;
        if (source is null)
        {
            return;
        }

        if (!string.IsNullOrEmpty(source.RequestCode))
        {
            journal.RequestCode = source.RequestCode;
        }

        // The source is read now, so its status is the newest known.
        journal.TransportStatusSnapshot = source.TransportRequestStatus ?? journal.TransportStatusSnapshot;
        journal.TransportStatusAtUtc = now;
        var containers = source.Trips.Sum(t => t.ContainerIds.Count);
        if (journal.RequestedContainerCount == 0 && containers > 0)
        {
            journal.RequestedContainerCount = containers;
        }

        foreach (var trip in source.Trips)
        {
            foreach (var a in trip.Assignments)
            {
                await runs.ApplyAsync(journal, new AssignmentFacts(
                    a.AssignmentId, trip.JobId, trip.JobNo, a.RobotId, a.RobotCode, a.StartReason, a.StartedAt, a.EndedAt,
                    a.EndReason, trip.Status, trip.ContainerIds, trip.MapVersionId, trip.MapVersionCode), cancellationToken);
            }
        }

        JournalStatusService.Touch(journal, now);
    }
}

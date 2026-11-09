using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Features.CreateTransportRequest;
using WaroTrans.Transportation.Features.QueueTransportRequest;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Transportation.Services;

/// <summary>
/// WH-09: turns due waves into Transport Requests through the normal create and queue path, so the same checks apply and
/// the Jobs are split as usual. A wave makes at most one request and is never retried, so a failure cannot pile up Jobs.
/// Queued requests wait for a person to start them: a schedule never moves a robot by itself.
/// </summary>
public sealed class TransportScheduleProcessor(
    TransportationDbContext db,
    IStoredContainerQuery storedContainers,
    IContainerTransportLookup transports,
    CreateTransportRequestHandler createRequest,
    QueueTransportRequestHandler queueRequest,
    ILogger<TransportScheduleProcessor> logger)
{
    /// <summary>A wave found later than this after its time was missed, not run late.</summary>
    public static readonly TimeSpan MissedAfter = TimeSpan.FromMinutes(10);

    public async Task TickAsync(DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var scheduleIds = await db.TransportSchedules.AsNoTracking()
            .Where(s => s.Status == TransportScheduleStatus.ACTIVE)
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);

        foreach (var id in scheduleIds)
        {
            db.ChangeTracker.Clear();
            try
            {
                await ProcessAsync(id, now, cancellationToken);
            }
            catch (DbUpdateException exception)
            {
                // Another worker took this wave or planned this occurrence first.
                logger.LogInformation(exception, "Schedule {ScheduleId} was handled elsewhere", id);
            }
        }
    }

    private async Task ProcessAsync(Guid scheduleId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var schedule = await db.TransportSchedules.FirstAsync(s => s.Id == scheduleId, cancellationToken);
        var due = await db.TransportWaves
            .Where(w => w.TransportScheduleId == scheduleId && w.Status == TransportWaveStatus.PLANNED && w.PlannedAt <= now)
            .OrderBy(w => w.PlannedAt)
            .ToListAsync(cancellationToken);

        foreach (var wave in due)
        {
            if (now - wave.PlannedAt > MissedAfter)
            {
                Close(wave, TransportWaveStatus.MISSED, now, "Not running when it was due.");
                await db.SaveChangesAsync(cancellationToken);
            }
            else
            {
                await RunAsync(schedule, wave, now, cancellationToken);
            }
        }

        await PlanNextAsync(schedule, now, cancellationToken);
    }

    private async Task PlanNextAsync(TransportSchedule schedule, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (await db.TransportWaves.AnyAsync(
                w => w.TransportScheduleId == schedule.Id && w.Status == TransportWaveStatus.PLANNED,
                cancellationToken))
        {
            return;
        }

        var last = await db.TransportWaves
            .Where(w => w.TransportScheduleId == schedule.Id)
            .OrderByDescending(w => w.PlannedAt)
            .Select(w => (DateTimeOffset?)w.PlannedAt)
            .FirstOrDefaultAsync(cancellationToken);

        // From now, not from the last wave: time the Host was down leaves no burst of old occurrences.
        var after = last is { } at && at > now ? at : now;
        if (ScheduleOccurrences.NextAfter(schedule, after) is { } next)
        {
            db.TransportWaves.Add(new TransportWave
            {
                Id = Guid.NewGuid(),
                TransportScheduleId = schedule.Id,
                PlannedAt = next,
                Status = TransportWaveStatus.PLANNED
            });
        }
        else
        {
            schedule.Status = TransportScheduleStatus.FINISHED;
            schedule.UpdatedAt = now;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task RunAsync(TransportSchedule schedule, TransportWave wave, DateTimeOffset now, CancellationToken cancellationToken)
    {
        // Conditional claim: of several workers one moves it out of PLANNED, and only that one creates the request.
        var claimed = await db.TransportWaves
            .Where(w => w.Id == wave.Id && w.Status == TransportWaveStatus.PLANNED)
            .ExecuteUpdateAsync(
                set => set.SetProperty(w => w.Status, TransportWaveStatus.STARTED).SetProperty(w => w.ProcessedAt, now),
                cancellationToken);
        if (claimed == 0)
        {
            return;
        }

        await db.Entry(wave).ReloadAsync(cancellationToken);
        var picked = await PickContainersAsync(schedule, cancellationToken);
        if (picked.Count == 0)
        {
            Close(wave, TransportWaveStatus.SKIPPED, now, "No stored container matched the rule.");
            await db.SaveChangesAsync(cancellationToken);
            return;
        }

        try
        {
            var created = await createRequest.CreateForAsync(
                new CreateTransportRequestRequest(
                    schedule.WarehouseId,
                    schedule.MapVersionId,
                    schedule.WorkflowId,
                    null,
                    $"Schedule {schedule.Name}, wave {wave.PlannedAt:yyyy-MM-dd HH:mm}Z",
                    picked.Select((container, index) => new CreateTransportRequestDetailRequest(
                        index + 1,
                        container.Id,
                        schedule.SourceStorageLocationId,
                        schedule.SourceEndpointId,
                        container.LevelNo,
                        schedule.DestinationStorageLocationId,
                        schedule.DestinationEndpointId,
                        schedule.DestinationLevelNo)).ToList()),
                schedule.CreatedBy,
                cancellationToken);
            wave.TransportRequestId = created.Id;
            wave.ContainerCount = picked.Count;
            await db.SaveChangesAsync(cancellationToken);
            await queueRequest.HandleAsync(created.Id, cancellationToken);
            logger.LogInformation("Schedule {Schedule}: wave {PlannedAt} queued request {RequestId}", schedule.Name, wave.PlannedAt, created.Id);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Schedule {Schedule}: wave {PlannedAt} failed", schedule.Name, wave.PlannedAt);
            db.ChangeTracker.Clear();
            await db.TransportWaves
                .Where(w => w.Id == wave.Id)
                .ExecuteUpdateAsync(
                    set => set
                        .SetProperty(w => w.Status, TransportWaveStatus.FAILED)
                        .SetProperty(w => w.Note, exception.Message.Length > 500 ? exception.Message[..500] : exception.Message),
                    cancellationToken);
        }
    }

    private async Task<IReadOnlyList<StoredContainer>> PickContainersAsync(TransportSchedule schedule, CancellationToken cancellationToken)
    {
        var stored = await storedContainers.GetStoredAsync(
            schedule.ProductId,
            schedule.SourceStorageLocationId,
            cancellationToken);
        if (stored.Count == 0)
        {
            return [];
        }

        var moving = await transports.GetContainersInActiveTransportAsync(stored.Select(c => c.Id).ToList(), cancellationToken);
        return stored.Where(c => !moving.Contains(c.Id)).Take(schedule.MaxContainersPerWave).ToList();
    }

    private static void Close(TransportWave wave, TransportWaveStatus status, DateTimeOffset now, string note)
    {
        wave.Status = status;
        wave.ProcessedAt = now;
        wave.Note = note;
    }
}

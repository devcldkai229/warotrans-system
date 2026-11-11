using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Transportation.Services;

/// <summary>
/// Sends queued handovers to Warehouse in order, per Container: a delivery never overtakes a pickup that still has to
/// post. A failure waits and retries; after <see cref="AttemptsBeforeIssue"/> tries someone is told through an issue.
/// </summary>
public sealed class StockPostingProcessor(
    TransportationDbContext db,
    IContainerMovementRecorder movements,
    ILogger<StockPostingProcessor> logger,
    IIssueReporter? issues = null)
{
    public const int AttemptsBeforeIssue = 5;
    private const int BatchSize = 200;
    private static readonly TimeSpan MaxBackoff = TimeSpan.FromMinutes(5);

    /// <summary>Posts this one now, unless an older posting of the same Container is still waiting.</summary>
    public async Task PostNowAsync(StockPosting posting, CancellationToken cancellationToken = default)
    {
        var olderWaiting = await db.StockPostings.AnyAsync(
            p => p.ContainerId == posting.ContainerId && p.PostedAt == null && p.Id != posting.Id && p.CreatedAt <= posting.CreatedAt,
            cancellationToken);
        if (!olderWaiting)
        {
            await TryPostAsync(posting, DateTimeOffset.UtcNow, cancellationToken);
        }
    }

    /// <returns>How many were posted.</returns>
    public async Task<int> DrainAsync(DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var waiting = await db.StockPostings
            .Where(p => p.PostedAt == null)
            .OrderBy(p => p.CreatedAt)
            .Take(BatchSize)
            .ToListAsync(cancellationToken);

        var blocked = new HashSet<Guid>();
        var posted = 0;
        foreach (var posting in waiting)
        {
            if (blocked.Contains(posting.ContainerId))
            {
                continue;
            }

            if (posting.NextAttemptAt > now || !await TryPostAsync(posting, now, cancellationToken))
            {
                blocked.Add(posting.ContainerId);
                continue;
            }

            posted++;
        }

        return posted;
    }

    private async Task<bool> TryPostAsync(StockPosting posting, DateTimeOffset now, CancellationToken cancellationToken)
    {
        try
        {
            if (posting.Type == StockPostingType.PICKUP)
            {
                await movements.RecordPickedUpAsync(
                    new ContainerPickup(posting.ContainerId, posting.JobId, posting.TransportRequestId),
                    cancellationToken);
            }
            else
            {
                await movements.RecordDeliveredAsync(
                    new ContainerDelivery(
                        posting.ContainerId,
                        posting.DestinationStorageLocationId,
                        posting.DestinationLevelNo,
                        posting.JobId,
                        posting.TransportRequestId),
                    cancellationToken);
            }

            posting.PostedAt = now;
            posting.NextAttemptAt = null;
            posting.LastError = null;
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            posting.Attempts++;
            posting.NextAttemptAt = now + Backoff(posting.Attempts);
            posting.LastError = exception.Message.Length > 500 ? exception.Message[..500] : exception.Message;
            await db.SaveChangesAsync(cancellationToken);
            logger.LogError(
                exception,
                "Stock posting {Key} failed (attempt {Attempts}); retry at {NextAttemptAt}",
                posting.Key,
                posting.Attempts,
                posting.NextAttemptAt);

            if (posting.Attempts == AttemptsBeforeIssue && issues is not null)
            {
                await issues.ReportAsync(
                    new SystemIssueDraft(
                        $"stock-posting:{posting.Key}",
                        posting.JobId,
                        posting.JobId.ToString("N")[..8],
                        null,
                        null,
                        posting.ContainerId,
                        $"Warehouse stock could not be updated for a {posting.Type} of this container after "
                        + $"{posting.Attempts} attempts: {posting.LastError}. It keeps retrying.",
                        High: true,
                        TransportRequestId: posting.TransportRequestId),
                    cancellationToken);
            }

            return false;
        }
    }

    private static TimeSpan Backoff(int attempts)
    {
        var seconds = TimeSpan.FromSeconds(5 * Math.Pow(2, Math.Min(attempts - 1, 10)));
        return seconds < MaxBackoff ? seconds : MaxBackoff;
    }
}

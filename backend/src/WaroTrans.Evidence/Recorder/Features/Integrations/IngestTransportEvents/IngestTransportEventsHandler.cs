using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using WaroTrans.Evidence.Contracts;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder.Features.Journals;
using WaroTrans.Evidence.Recorder.Features.Runs;

namespace WaroTrans.Evidence.Recorder.Features.Integrations.IngestTransportEvents;

/// <summary>
/// Takes in the events the monolith pushes. Each event is applied once (inbox), in its own transaction, so one bad event
/// never blocks the others. Order does not matter: an assignment's CLOSED before its OPENED, or a step event before
/// its run, still files correctly (late events find their run by trip and time).
/// </summary>
internal sealed class IngestTransportEventsHandler(
    EvidenceDbContext db,
    RunUpserter runs,
    JournalStatusService statuses,
    TimeProvider clock,
    ILogger<IngestTransportEventsHandler> logger)
{
    private const int MaxAttempts = 3;

    public async Task<TransportEventBatchResult> HandleAsync(TransportEventBatch batch, CancellationToken cancellationToken)
    {
        var accepted = 0;
        var rejected = new List<RejectedTransportEvent>();
        // Runs first: an assignment opened in the same batch as its first step events.
        foreach (var envelope in batch.Events
                     .OrderBy(e => e.EventType == TransportEventTypes.JobRobotAssignmentChanged ? 0 : 1)
                     .ThenBy(e => e.OccurredAtUtc))
        {
            if (Problem(envelope) is { } problem)
            {
                rejected.Add(new RejectedTransportEvent(envelope.EventId, problem));
                continue;
            }

            try
            {
                await ApplyWithRetryAsync(envelope, cancellationToken);
                accepted++;
            }
            catch (Exception ex) when (ex is JsonException or FormatException or InvalidOperationException or KeyNotFoundException)
            {
                logger.LogWarning(ex, "Evidence: refused {EventType} {EventId}", envelope.EventType, envelope.EventId);
                rejected.Add(new RejectedTransportEvent(envelope.EventId, $"invalid_payload: {ex.Message}"));
            }
        }

        return new TransportEventBatchResult(accepted, rejected);
    }

    internal static string? Problem(TransportEventEnvelope e)
    {
        if (e.EventId == Guid.Empty)
        {
            return "event_id_missing";
        }

        if (e.SchemaVersion != 1)
        {
            return $"schema_version_unsupported: {e.SchemaVersion}";
        }

        if (!TransportEventTypes.All.Contains(e.EventType))
        {
            return $"event_type_unknown: {e.EventType}";
        }

        if (string.IsNullOrWhiteSpace(e.Source) || e.Source.Length > 64)
        {
            return "source_missing";
        }

        if (e.OccurredAtUtc == default)
        {
            return "occurred_at_missing";
        }

        if (e.EventType == TransportEventTypes.JobRobotAssignmentChanged
            && (e.AssignmentId is null || e.JobId is null || e.TransportRequestId is null))
        {
            return "assignment_event_incomplete";
        }

        if (!TransportEventTypes.IsRobotScoped(e.EventType) && e.TransportRequestId is null)
        {
            return "transport_request_missing";
        }

        if (TransportEventTypes.IsRobotScoped(e.EventType) && string.IsNullOrEmpty(e.RobotCode))
        {
            return "robot_code_missing";
        }

        return null;
    }

    private async Task ApplyWithRetryAsync(TransportEventEnvelope envelope, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            db.ChangeTracker.Clear();
            try
            {
                await ApplyAsync(envelope, cancellationToken);
                return;
            }
            catch (Exception ex) when (attempt < MaxAttempts && IsRace(ex))
            {
                // Another request created the same journal/run/inbox row at the same moment: read again.
                await Task.Delay(20 * attempt, cancellationToken);
            }
        }
    }

    private static bool IsRace(Exception ex) =>
        ex is DbUpdateConcurrencyException
        || ex is DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } };

    private async Task ApplyAsync(TransportEventEnvelope e, CancellationToken cancellationToken)
    {
        var messageId = e.EventId.ToString("D");
        if (await db.Inbox.AnyAsync(i => i.Source == e.Source && i.MessageId == messageId, cancellationToken))
        {
            return; // already applied
        }

        var now = clock.GetUtcNow();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var journal = e.TransportRequestId is { } requestId ? await JournalAsync(requestId, e.RequestCode, now, cancellationToken) : null;
        RobotRunEvidence? run = null;

        switch (e.EventType)
        {
            case TransportEventTypes.JobRobotAssignmentChanged:
                run = await runs.ApplyAsync(journal!, Facts(e), cancellationToken);
                ApplyRequestFacts(journal!, e, now);
                break;
            case TransportEventTypes.TransportRequestProgressed:
            case TransportEventTypes.TransportRequestClosed:
                ApplyRequestFacts(journal!, e, now);
                break;
        }

        if (journal is null)
        {
            // About a robot only: file it under the run that robot had at that moment, if any.
            run = await RunOfRobotAtAsync(e.RobotCode!, e.OccurredAtUtc, cancellationToken);
            if (run is not null)
            {
                journal = await db.Journals.FirstAsync(j => j.Id == run.JournalId, cancellationToken);
            }
        }
        else if (run is null && e.JobId is { } jobId)
        {
            run = await RunOfJobAtAsync(journal.Id, jobId, e.OccurredAtUtc, cancellationToken);
            if (run is not null && e.EventType == TransportEventTypes.JobStatusChanged && run.EndedAtUtc is null)
            {
                run.TransportRunStatusSnapshot = e.SourceStatusCode;
                run.UpdatedAtUtc = now;
            }
        }

        if (journal is not null)
        {
            AddEvent(journal.Id, run?.Id, e, now);
            await statuses.RecomputeAsync(journal, cancellationToken);
        }

        db.Inbox.Add(new EvidenceInbox
        {
            Id = Guid.NewGuid(),
            MessageId = messageId,
            Source = e.Source,
            EventType = e.EventType,
            PayloadVersion = (short)e.SchemaVersion,
            ProcessedAtUtc = now,
            Hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(e.Payload.GetRawText())))
        });
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private async Task<EvidenceJournal> JournalAsync(Guid requestId, string? requestCode, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var journal = await db.Journals.FirstOrDefaultAsync(j => j.TransportRequestId == requestId, cancellationToken);
        if (journal is null)
        {
            journal = new EvidenceJournal
            {
                Id = Guid.NewGuid(),
                TransportRequestId = requestId,
                RequestCode = requestCode ?? string.Empty,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            db.Journals.Add(journal);
        }
        else if (!string.IsNullOrEmpty(requestCode) && journal.RequestCode != requestCode)
        {
            journal.RequestCode = requestCode;
            JournalStatusService.Touch(journal, now);
        }

        return journal;
    }

    /// <summary>The request's status and size, kept only if at least as new as what is already known.</summary>
    private static void ApplyRequestFacts(EvidenceJournal journal, TransportEventEnvelope e, DateTimeOffset now)
    {
        var status = e.EventType == TransportEventTypes.JobRobotAssignmentChanged
            ? EventClassifier.Str(e.Payload, "transportRequestStatus")
            : e.SourceStatusCode;
        if (status is not null && (journal.TransportStatusAtUtc is null || e.OccurredAtUtc >= journal.TransportStatusAtUtc))
        {
            journal.TransportStatusSnapshot = status;
            journal.TransportStatusAtUtc = e.OccurredAtUtc;
        }

        var count = e.EventType == TransportEventTypes.TransportRequestProgressed
            ? EventClassifier.Num(e.Payload, "totalDetails")
            : EventClassifier.Num(e.Payload, "requestContainerCount");
        if (count is { } c && c >= 0
            && (e.EventType == TransportEventTypes.TransportRequestProgressed || journal.RequestedContainerCount == 0))
        {
            journal.RequestedContainerCount = (int)c;
        }

        JournalStatusService.Touch(journal, now);
    }

    private static AssignmentFacts Facts(TransportEventEnvelope e)
    {
        var p = e.Payload;
        var containers = p.TryGetProperty("containerIds", out var ids) && ids.ValueKind == JsonValueKind.Array
            ? ids.EnumerateArray().Select(x => x.GetGuid()).ToList()
            : null;
        return new AssignmentFacts(
            e.AssignmentId!.Value,
            e.JobId!.Value,
            e.JobNo ?? EventClassifier.Str(p, "jobNo"),
            e.RobotId,
            e.RobotCode,
            EventClassifier.Str(p, "startReason"),
            Time(p, "startedAt"),
            Time(p, "endedAt"),
            EventClassifier.Str(p, "endReason"),
            EventClassifier.Str(p, "jobStatus"),
            containers,
            Guid.TryParse(EventClassifier.Str(p, "mapVersionId"), out var map) ? map : null,
            EventClassifier.Str(p, "mapVersionCode"));
    }

    private static DateTimeOffset? Time(JsonElement payload, string name) =>
        EventClassifier.Str(payload, name) is { } text
            ? DateTimeOffset.Parse(text, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.RoundtripKind)
            : null;

    private async Task<RobotRunEvidence?> RunOfJobAtAsync(Guid journalId, Guid jobId, DateTimeOffset at, CancellationToken cancellationToken)
    {
        var candidates = await db.Runs
            .Where(r => r.JournalId == journalId && r.SourceJobId == jobId)
            .OrderBy(r => r.StartedAtUtc)
            .ToListAsync(cancellationToken);
        return candidates.LastOrDefault(r => r.StartedAtUtc <= at && (r.EndedAtUtc is null || r.EndedAtUtc >= at))
               ?? candidates.LastOrDefault(r => r.StartedAtUtc <= at)
               ?? candidates.FirstOrDefault();
    }

    private Task<RobotRunEvidence?> RunOfRobotAtAsync(string robotCode, DateTimeOffset at, CancellationToken cancellationToken) =>
        db.Runs
            .Where(r => r.RobotId == robotCode && r.StartedAtUtc <= at && (r.EndedAtUtc == null || r.EndedAtUtc >= at))
            .OrderByDescending(r => r.StartedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

    private void AddEvent(Guid journalId, Guid? runId, TransportEventEnvelope e, DateTimeOffset now)
    {
        var c = EventClassifier.Classify(e);
        var payload = JsonSerializer.Serialize(e, IngestTransportEventsEndpoint.Json);
        if (payload.Length > EvidenceEvent.MaxPayloadChars)
        {
            payload = JsonSerializer.Serialize(new { truncated = true, e.EventType, e.EventId, e.SourceStatusCode }, IngestTransportEventsEndpoint.Json);
        }

        db.Events.Add(new EvidenceEvent
        {
            Id = Guid.NewGuid(),
            JournalId = journalId,
            RobotRunEvidenceId = runId,
            SourceSystem = e.Source,
            SourceEventId = e.EventId.ToString("D"),
            Category = c.Category,
            EventType = e.EventType,
            Severity = c.Severity,
            OccurredAtUtc = e.OccurredAtUtc,
            ReceivedAtUtc = now,
            X = c.X,
            Y = c.Y,
            FrameId = c.X is null ? null : "map",
            Message = c.Message.Length > 500 ? c.Message[..500] : c.Message,
            Payload = payload,
            CorrelationId = e.JobNo ?? e.RequestCode,
            PayloadSchemaVersion = (short)e.SchemaVersion
        });
    }
}

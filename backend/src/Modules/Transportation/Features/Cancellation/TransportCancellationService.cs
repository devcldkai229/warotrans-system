using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.Shared;
using WaroTrans.Transportation.IntegrationEvents;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Transportation.Persistence.Configurations;
using WaroTrans.Transportation.Services;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Enums;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Features.Cancellation;

/// <summary>
/// TRN-03: cancelling a TransportRequest is a long-running process owned by Transportation, not a status cascade.
///
///   1. the intent is stored once (idempotency key, one active cancellation per request);
///   2. the Jobs are told (WorkflowExecution): work not started is cancelled, a robot carrying cargo is stopped and
///      its Job held; delivered containers stay delivered;
///   3. each Job is followed until its robot holds still and every container of the request is delivered, unloaded by
///      a person who scanned it, or never picked up — then the cancellation is FINALIZED.
///
/// A robot is never assumed stopped because a STOP was sent, an offline robot holds the cancellation in WAITING_ROBOT,
/// and cargo cancelled without a handover holds it in MANUAL_INTERVENTION until someone recovers it.
/// </summary>
public sealed class TransportCancellationService(
    TransportationDbContext db,
    ITransportRequestJobControl jobControl,
    IWarehouseModule warehouse,
    ICurrentUser currentUser,
    IIntegrationEventPublisher events,
    StockPostingProcessor postings,
    ILogger<TransportCancellationService> logger,
    IIssueReporter? issues = null,
    TimeProvider? clock = null,
    Microsoft.Extensions.Options.IOptions<TransportCancellationOptions>? options = null)
{
    private TransportCancellationOptions Options => options?.Value ?? new TransportCancellationOptions();

    /// <summary>Where each robot was in its trip just before this cancel stopped it (destination policy).</summary>
    private Dictionary<Guid, string>? _phasesBeforeCancel;

    /// <summary>Set while this service changes Jobs itself, so container events do not refresh the same cancellation underneath it.</summary>
    private static readonly AsyncLocal<bool> Busy = new();

    public static bool IsBusy => Busy.Value;

    private DateTimeOffset Now => (clock ?? TimeProvider.System).GetUtcNow();

    // ------------------------------------------------------------------ preview

    public async Task<CancelPreviewResponse> PreviewAsync(Guid id, CancellationToken cancellationToken)
    {
        var request = await db.TransportRequests.AsNoTracking().Include(r => r.Details)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new NotFoundException($"TransportRequest '{id}' was not found.", "transport_request_not_found");
        var view = await jobControl.GetCancellationViewAsync(id, cancellationToken);
        var jobs = (await jobControl.GetJobsAsync([id], cancellationToken)).GetValueOrDefault(id) ?? [];
        var refused = TransportRequestActionPolicy.StateReason(TransportRequestActionPolicy.Cancel, request, jobs);
        var byContainer = view
            .SelectMany(j => j.Containers.Where(c => c.TransportRequestId == id).Select(c => (Job: j, Container: c)))
            .ToDictionary(x => x.Container.ContainerId);
        var barcodes = await BarcodesAsync(request.Details.Select(d => d.ContainerId).ToList(), cancellationToken);

        var details = request.Details.OrderBy(d => d.SequenceNo).Select(d =>
        {
            var hit = byContainer.TryGetValue(d.ContainerId, out var x) ? x : default;
            var jcStatus = hit.Container?.Status;
            string? alone = TransportRequest.IsTerminal(d.Status) ? "detail_closed"
                : refused is not null ? refused
                : jcStatus is null or "PENDING" or "ASSIGNED" ? null
                : "detail_already_picked_up";
            return new CancelPreviewDetail(
                d.Id, d.SequenceNo, d.ContainerId, barcodes.GetValueOrDefault(d.ContainerId), d.Status.ToString(),
                jcStatus, hit.Job?.JobNo, alone is null, alone);
        }).ToList();

        var previewJobs = view.Select(j =>
        {
            var mine = j.Containers.Where(c => c.TransportRequestId == id).ToList();
            return new CancelPreviewJob(
                j.JobId, j.JobNo, j.Status, j.RobotId, j.RobotCode, j.RobotOnline,
                mine.Count(c => c.Status == "DELIVERED"),
                mine.Count(c => c.Status == "ONBOARD"),
                mine.Count(c => c.Status is "PENDING" or "ASSIGNED"),
                mine.Count);
        }).ToList();

        return new CancelPreviewResponse(
            request.Id,
            request.RequestCode,
            request.Status.ToString(),
            refused is null,
            refused,
            request.Details.Count,
            request.Details.Count(d => d.Status == TransportRequestDetailStatus.COMPLETED),
            byContainer.Values.Count(x => x.Container.Status == "ONBOARD"),
            details.Count(d => !TransportRequest.IsTerminal(Enum.Parse<TransportRequestDetailStatus>(d.DetailStatus))
                               && d.JobContainerStatus is null or "PENDING" or "ASSIGNED"),
            request.Details.Count(d => d.Status is TransportRequestDetailStatus.CANCELLED or TransportRequestDetailStatus.FAILED),
            previewJobs,
            details,
            CancellationReasonCodes.All.Order().ToList());
    }

    // ------------------------------------------------------------------ request

    /// <returns>The cancellation, or null when the request was already cancelled before cancellations were recorded.</returns>
    public async Task<CancellationResponse?> RequestAsync(Guid id, CancelTransportRequestBody body, CancellationToken cancellationToken)
    {
        var reason = RequireReason(body.Reason);
        var reasonCode = string.IsNullOrWhiteSpace(body.ReasonCode)
            ? CancellationReasonCodes.OperatorRequested
            : body.ReasonCode.Trim().ToUpperInvariant();
        if (!CancellationReasonCodes.All.Contains(reasonCode))
        {
            throw new DomainValidationException(
                $"Unknown reason code '{reasonCode}'. Use one of {string.Join(", ", CancellationReasonCodes.All.Order())}.",
                "reason_code_invalid");
        }

        var key = string.IsNullOrWhiteSpace(body.IdempotencyKey) ? Guid.NewGuid().ToString("N") : body.IdempotencyKey.Trim();
        if (key.Length > 128)
        {
            throw new DomainValidationException("The idempotency key is longer than 128 characters.", "idempotency_key_too_long");
        }

        var detailIds = (body.DetailIds ?? []).Distinct().ToList();
        var scope = detailIds.Count == 0 ? CancellationScopes.Request : CancellationScopes.Details;

        var sameKey = await db.TransportCancellations.Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.IdempotencyKey == key, cancellationToken);
        if (sameKey is not null)
        {
            if (sameKey.TransportRequestId != id)
            {
                throw new ConflictException("This idempotency key was used for another request.", "idempotency_key_reused");
            }

            return await ResumeIfInterruptedAsync(sameKey, cancellationToken);
        }

        var request = await LoadRequestAsync(id, cancellationToken);
        var active = await db.TransportCancellations.Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.TransportRequestId == id && c.Status != CancellationStatuses.Finalized, cancellationToken);
        if (active is not null)
        {
            if (scope == CancellationScopes.Request && active.Scope == CancellationScopes.Request)
            {
                return await ResumeIfInterruptedAsync(active, cancellationToken);
            }

            throw new ConflictException("A cancellation of this request is still in progress.", "cancellation_in_progress");
        }

        if (scope == CancellationScopes.Request && request.Status == TransportRequestStatus.CANCELLED)
        {
            var latest = await LatestAsync(id, cancellationToken);
            return latest is null ? null : await RefreshAsync(latest, cancellationToken);
        }

        var jobs = (await jobControl.GetJobsAsync([id], cancellationToken)).GetValueOrDefault(id) ?? [];
        // CANCELLING without a cancellation record: a cancel from before TRN-03 that did not finish. Taken over below.
        if (!(scope == CancellationScopes.Request && request.Status == TransportRequestStatus.CANCELLING)
            && TransportRequestActionPolicy.StateReason(TransportRequestActionPolicy.Cancel, request, jobs) is { } refused)
        {
            throw new ConflictException($"TransportRequest {request.RequestCode} cannot be cancelled while {request.Status}.", refused);
        }

        if (scope == CancellationScopes.Details)
        {
            var unknown = detailIds.Except(request.Details.Select(d => d.Id)).ToList();
            if (unknown.Count > 0)
            {
                throw new DomainValidationException("Some of these details are not part of this request.", "detail_not_in_request");
            }
        }

        var now = Now;
        var operation = new TransportCancellation
        {
            Id = Guid.NewGuid(),
            TransportRequestId = id,
            Scope = scope,
            TargetDetailIds = scope == CancellationScopes.Details ? detailIds : null,
            Status = CancellationStatuses.Requested,
            ReasonCode = reasonCode,
            Reason = reason,
            RequestedBy = currentUser.AccountId,
            RequestedAt = now,
            IdempotencyKey = key,
            UpdatedAt = now
        };
        db.TransportCancellations.Add(operation);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } unique)
        {
            // Two cancels at the same moment: the first one stored wins, the second answers with it.
            db.ChangeTracker.Clear();
            var winner = await db.TransportCancellations.Include(c => c.Items).FirstOrDefaultAsync(
                c => unique.ConstraintName == TransportCancellationConfiguration.ActivePerRequestIndex
                    ? c.TransportRequestId == id && c.Status != CancellationStatuses.Finalized
                    : c.IdempotencyKey == key,
                cancellationToken);
            if (winner is null || (winner.Scope != scope && winner.IdempotencyKey != key))
            {
                throw new ConflictException("A cancellation of this request is still in progress.", "cancellation_in_progress");
            }

            return await RefreshAsync(winner, cancellationToken);
        }

        logger.LogInformation(
            "TransportRequest {RequestCode}: cancellation {CancellationId} ({Scope}, {ReasonCode}) requested by {Actor}",
            request.RequestCode, operation.Id, scope, reasonCode, currentUser.Username);
        await events.PublishAsync(
            new TransportCancellationProgressed(operation.Id, id, request.RequestCode, scope, operation.Status, reasonCode, currentUser.AccountId),
            cancellationToken);

        return await ExecuteAsync(operation.Id, cancellationToken);
    }

    /// <summary>The fan-out to the Jobs failed half-way last time (LastError): run it again. It is idempotent.</summary>
    private async Task<CancellationResponse> ResumeIfInterruptedAsync(TransportCancellation operation, CancellationToken cancellationToken) =>
        operation.LastError is not null && operation.IsActive
            ? await ExecuteAsync(operation.Id, cancellationToken)
            : await RefreshAsync(operation, cancellationToken);

    private async Task<CancellationResponse> ExecuteAsync(Guid operationId, CancellationToken cancellationToken)
    {
        var operation = await db.TransportCancellations.AsNoTracking().FirstAsync(c => c.Id == operationId, cancellationToken);
        var previous = Busy.Value;
        Busy.Value = true;
        try
        {
            _phasesBeforeCancel = (await jobControl.GetCancellationViewAsync(operation.TransportRequestId, cancellationToken))
                .ToDictionary(j => j.JobId, j => j.Phase);
            if (operation.Scope == CancellationScopes.Request)
                await CancelWholeRequestAsync(operation, cancellationToken);
            else
                await CancelDetailsAsync(operation, cancellationToken);
        }
        catch (AppException ex) when (operation.Scope == CancellationScopes.Details)
        {
            // Nothing was cancelled (the Job refused under its lock): the operation did not happen.
            db.ChangeTracker.Clear();
            var failed = await db.TransportCancellations.FirstAsync(c => c.Id == operationId, cancellationToken);
            failed.Status = CancellationStatuses.Finalized;
            failed.FinalizedAt = Now;
            failed.LastError = Trim(ex.Message);
            failed.UpdatedAt = Now;
            failed.Version++;
            await db.SaveChangesAsync(CancellationToken.None);
            throw;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            db.ChangeTracker.Clear();
            var failed = await db.TransportCancellations.FirstAsync(c => c.Id == operationId, CancellationToken.None);
            failed.LastError = Trim(ex.Message);
            failed.UpdatedAt = Now;
            failed.Version++;
            await db.SaveChangesAsync(CancellationToken.None);
            logger.LogError(ex, "Cancellation {CancellationId}: telling the Jobs failed; it is retried on the next cancel", operationId);
            throw;
        }
        finally
        {
            Busy.Value = previous;
        }

        db.ChangeTracker.Clear();
        var stored = await db.TransportCancellations.Include(c => c.Items).FirstAsync(c => c.Id == operationId, cancellationToken);
        stored.LastError = null;
        return await RefreshAsync(stored, cancellationToken);
    }

    /// <summary>TRN-01 behaviour kept: request CANCELLING first, then its Jobs, then the details from what the Jobs did.</summary>
    private async Task CancelWholeRequestAsync(TransportCancellation operation, CancellationToken cancellationToken)
    {
        var reason = operation.Reason ?? operation.ReasonCode;
        var requestId = operation.TransportRequestId;
        TransportRequest request;
        await using (var transaction = await TransportRequestWriteLock.AcquireAsync(db, requestId, cancellationToken))
        {
            db.ChangeTracker.Clear();
            request = await LoadRequestAsync(requestId, cancellationToken);
            if (request.Status != TransportRequestStatus.CANCELLING)
            {
                request.Status = TransportRequestStatus.CANCELLING;
                request.CancelledBy = operation.RequestedBy;
                request.CancelReason = reason;
                request.CancelRequestedAt = operation.RequestedAt;
                request.UpdatedAt = Now;
                await db.SaveChangesAsync(cancellationToken);
            }

            if (transaction is not null)
                await transaction.CommitAsync(cancellationToken);
        }

        // WorkflowExecution and container events acquire their own locks during the fan-out.
        var outcomes = await jobControl.CancelForRequestAsync(requestId, reason, cancellationToken);
        var inRecovery = outcomes
            .Where(o => o.Outcome == ContainerCancelOutcome.RecoveryRequired)
            .Select(o => o.ContainerId)
            .ToHashSet();
        var confirmedHandovers = outcomes.Where(o => o.Outcome is ContainerCancelOutcome.AlreadyDelivered or ContainerCancelOutcome.AlreadyHandedOver)
            .Select(o => o.ContainerId).ToHashSet();

        await using (var transaction = await TransportRequestWriteLock.AcquireAsync(db, requestId, cancellationToken))
        {
            db.ChangeTracker.Clear();
            request = await LoadRequestAsync(requestId, cancellationToken);
            request.ApplyCancel(request.CancelledBy ?? operation.RequestedBy, request.CancelReason ?? reason, inRecovery, Now, confirmedHandovers);
            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null)
                await transaction.CommitAsync(cancellationToken);
        }

        logger.LogInformation(
            "TransportRequest {RequestCode} cancelled: {Recovery} container(s) on a robot, status {Status}",
            request.RequestCode, inRecovery.Count, request.Status);
        await events.PublishAsync(TransportRequestEvents.Progressed(request), cancellationToken);
        await events.PublishAsync(
            new TransportRequestClosedByOperator(
                request.Id, request.RequestCode, request.Status, request.RequestedBy, operation.RequestedBy, reason, inRecovery.Count),
            cancellationToken);
    }

    private async Task CancelDetailsAsync(TransportCancellation operation, CancellationToken cancellationToken)
    {
        var reason = operation.Reason ?? operation.ReasonCode;
        var request = await LoadRequestAsync(operation.TransportRequestId, cancellationToken);
        var targets = request.Details
            .Where(d => operation.TargetDetailIds!.Contains(d.Id) && !TransportRequest.IsTerminal(d.Status))
            .ToList();
        if (targets.Count == 0)
        {
            return;
        }

        var containerIds = targets.Select(d => d.ContainerId).ToList();
        var outcomes = await jobControl.CancelContainersBeforePickupAsync(request.Id, containerIds, $"Detail cancelled: {reason}", cancellationToken);
        var handledByJobs = outcomes.Select(o => o.ContainerId).ToHashSet();

        await using (var transaction = await TransportRequestWriteLock.AcquireAsync(db, request.Id, cancellationToken))
        {
            db.ChangeTracker.Clear();
            request = await LoadRequestAsync(request.Id, cancellationToken);
            var now = Now;
            // Details without Jobs can be cancelled directly.
            foreach (var detail in request.Details.Where(d =>
                         containerIds.Contains(d.ContainerId) && !handledByJobs.Contains(d.ContainerId) && !TransportRequest.IsTerminal(d.Status)))
            {
                detail.Status = TransportRequestDetailStatus.CANCELLED;
                detail.UpdatedAt = now;
            }

            request.ApplyDetailProgress(now);
            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null)
                await transaction.CommitAsync(cancellationToken);
        }
        logger.LogInformation("TransportRequest {RequestCode}: {Count} detail(s) cancelled before pickup", request.RequestCode, targets.Count);
        await events.PublishAsync(TransportRequestEvents.Progressed(request), cancellationToken);
    }

    // ------------------------------------------------------------------ follow-up

    /// <returns>The request's latest cancellation, or null when it was never cancelled.</returns>
    public async Task<CancellationResponse?> GetAsync(Guid transportRequestId, CancellationToken cancellationToken)
    {
        var latest = await LatestAsync(transportRequestId, cancellationToken);
        if (latest is null)
        {
            // A cancel from before TRN-03 still waiting for its cargo gets a record now, so it can be followed.
            var request = await db.TransportRequests.AsNoTracking().FirstOrDefaultAsync(r => r.Id == transportRequestId, cancellationToken)
                ?? throw new NotFoundException($"TransportRequest '{transportRequestId}' was not found.", "transport_request_not_found");
            if (request.Status != TransportRequestStatus.CANCELLING)
            {
                return null;
            }

            latest = new TransportCancellation
            {
                Id = Guid.NewGuid(),
                TransportRequestId = request.Id,
                Scope = CancellationScopes.Request,
                Status = CancellationStatuses.Requested,
                ReasonCode = CancellationReasonCodes.OperatorRequested,
                Reason = request.CancelReason,
                RequestedBy = request.CancelledBy,
                RequestedAt = request.CancelRequestedAt ?? request.UpdatedAt,
                IdempotencyKey = $"legacy:{request.Id:N}",
                UpdatedAt = Now
            };
            db.TransportCancellations.Add(latest);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                db.ChangeTracker.Clear();
                latest = (await LatestAsync(transportRequestId, cancellationToken))!;
            }
        }

        return await RefreshAsync(latest, cancellationToken);
    }

    /// <summary>Called when a container of the request changed (event) and by the background refresh.</summary>
    public async Task RefreshForRequestAsync(Guid transportRequestId, CancellationToken cancellationToken)
    {
        if (IsBusy)
        {
            return;
        }

        var active = await db.TransportCancellations.Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.TransportRequestId == transportRequestId && c.Status != CancellationStatuses.Finalized, cancellationToken);
        if (active is not null)
        {
            await RefreshAsync(active, cancellationToken);
        }
    }

    public async Task<int> RefreshActiveAsync(CancellationToken cancellationToken)
    {
        var ids = await db.TransportCancellations.AsNoTracking()
            .Where(c => c.Status != CancellationStatuses.Finalized)
            .Select(c => c.TransportRequestId)
            .ToListAsync(cancellationToken);
        foreach (var id in ids)
        {
            db.ChangeTracker.Clear();
            try
            {
                await RefreshForRequestAsync(id, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Refreshing the cancellation of request {RequestId} failed", id);
            }
        }

        return ids.Count;
    }

    // ------------------------------------------------------------------ cargo on a robot

    /// <summary>
    /// A person took a container off a held robot, scanned its label and put it on a shelf. The place is stored first,
    /// then the Job lets go of the container, then Warehouse is told through the ordered stock postings (after the
    /// pickup, never before it). Doing it twice records it once.
    /// </summary>
    public async Task<CancellationResponse> HandOverAsync(
        Guid transportRequestId, Guid jobId, CancelHandoverBody body, CancellationToken cancellationToken)
    {
        var actor = currentUser.AccountId
            ?? throw new AppException("Unloading cargo needs a signed-in account.", 401, "unauthenticated");

        // A repeated scan after the cancellation finished answers with it, like any repeat.
        var latest = await LatestAsync(transportRequestId, cancellationToken);
        if (latest is { IsActive: false }
            && latest.Items.Any(i => i.JobId == jobId
                && i.Containers.Any(c => c.ContainerId == body.ContainerId && c.Resolution == ContainerResolutions.HandedOver)))
        {
            return await RefreshAsync(latest, cancellationToken);
        }

        var operation = await ActiveAsync(transportRequestId, cancellationToken);
        var item = operation.Items.FirstOrDefault(i => i.JobId == jobId)
            ?? throw new NotFoundException("This Job is not part of the cancellation.", "cancellation_job_not_found");
        var row = item.Containers.FirstOrDefault(c => c.ContainerId == body.ContainerId)
            ?? throw new NotFoundException("This container is not part of the cancellation for this Job.", "cancellation_container_not_found");

        if (row.Resolution == ContainerResolutions.HandedOver)
        {
            return await RefreshAsync(operation, cancellationToken);
        }

        var levelNo = body.LevelNo ?? 1;
        if (levelNo < 1)
        {
            throw new DomainValidationException("The shelf level starts at 1.", "level_invalid");
        }

        var location = (await warehouse.GetStorageLocationsAsync([body.StorageLocationId], cancellationToken)).FirstOrDefault();
        if (location is not { IsActive: true })
        {
            throw new DomainValidationException("Choose an active shelf for the container.", "storage_location_not_found");
        }

        // The intent first: if anything after this fails, the refresh still knows where the container went.
        var now = Now;
        SetContainer(item, body.ContainerId, c =>
        {
            c.StorageLocationId = body.StorageLocationId;
            c.LevelNo = levelNo;
            c.ScannedBarcode = body.ScannedBarcode?.Trim();
            c.HandedOverBy = actor;
        });
        item.UpdatedAt = now;
        operation.Version++;
        await db.SaveChangesAsync(cancellationToken);

        var previous = Busy.Value;
        Busy.Value = true;
        try
        {
            await jobControl.HandOverCancelledCargoAsync(
                jobId, transportRequestId, body.ContainerId, body.ScannedBarcode, actor, body.Note, cancellationToken);
        }
        catch
        {
            db.ChangeTracker.Clear();
            var undo = await db.TransportCancellations.Include(c => c.Items).FirstAsync(c => c.Id == operation.Id, CancellationToken.None);
            SetContainer(undo.Items.First(i => i.JobId == jobId), body.ContainerId, c =>
            {
                c.StorageLocationId = null;
                c.LevelNo = null;
                c.ScannedBarcode = null;
                c.HandedOverBy = null;
            });
            undo.Version++;
            await db.SaveChangesAsync(CancellationToken.None);
            throw;
        }
        finally
        {
            Busy.Value = previous;
        }

        db.ChangeTracker.Clear();
        operation = await db.TransportCancellations.Include(c => c.Items).FirstAsync(c => c.Id == operation.Id, cancellationToken);
        item = operation.Items.First(i => i.JobId == jobId);
        SetContainer(item, body.ContainerId, c =>
        {
            c.HandedOverAt ??= now;
            c.Resolution = ContainerResolutions.HandedOver;
        });
        operation.Version++;
        await db.SaveChangesAsync(cancellationToken);
        await EnsureHandoverPostingsAsync(operation, cancellationToken);

        logger.LogInformation(
            "Cancellation {CancellationId}: container {ContainerId} of Job {JobNo} unloaded by hand to {Location} level {Level}",
            operation.Id, body.ContainerId, item.JobNo, location.Code, levelNo);
        await events.PublishAsync(
            new TransportCancellationCargoHandedOver(operation.Id, transportRequestId, jobId, body.ContainerId, body.StorageLocationId, levelNo, actor),
            cancellationToken);
        return await RefreshAsync(operation, cancellationToken);
    }

    /// <summary>Deliver the cargo anyway: the held Job runs again and only drops off what is on board.</summary>
    public async Task<CancellationResponse> DeliverAsync(Guid transportRequestId, Guid jobId, CancellationToken cancellationToken)
    {
        var actor = currentUser.AccountId
            ?? throw new AppException("Delivering cargo needs a signed-in account.", 401, "unauthenticated");
        var operation = await ActiveAsync(transportRequestId, cancellationToken);
        if (operation.Items.All(i => i.JobId != jobId))
        {
            throw new NotFoundException("This Job is not part of the cancellation.", "cancellation_job_not_found");
        }

        var job = (await jobControl.GetCancellationViewAsync(transportRequestId, cancellationToken)).FirstOrDefault(j => j.JobId == jobId);
        if (job?.Phase != CancelRobotPhases.AtDropoff && !Options.AllowsDelivery(operation.ReasonCode))
        {
            throw new ConflictException(
                $"The request was cancelled for {operation.ReasonCode}: its cargo is not delivered. Send the robot to a recovery point or unload it by scan.",
                "reason_forbids_delivery");
        }

        await jobControl.DeliverCancelledCargoAsync(jobId, actor, cancellationToken);
        db.ChangeTracker.Clear();
        operation = await db.TransportCancellations.Include(c => c.Items).FirstAsync(c => c.Id == operation.Id, cancellationToken);
        return await RefreshAsync(operation, cancellationToken);
    }

    /// <summary>The wait / queue points the robot of this Job could take its cargo to.</summary>
    public async Task<IReadOnlyList<RecoveryPointView>> RecoveryPointsAsync(Guid transportRequestId, Guid jobId, CancellationToken cancellationToken)
    {
        var operation = await ActiveAsync(transportRequestId, cancellationToken);
        if (operation.Items.All(i => i.JobId != jobId))
        {
            throw new NotFoundException("This Job is not part of the cancellation.", "cancellation_job_not_found");
        }

        return await jobControl.GetRecoveryPointsAsync(jobId, cancellationToken);
    }

    /// <summary>
    /// Destination policy, cargo on a robot between stops: the robot takes it to a recovery point and holds still there
    /// for the unload by scan. Without an endpoint the nearest free one is taken.
    /// </summary>
    public async Task<CancellationResponse> SendToRecoveryAsync(Guid transportRequestId, Guid jobId, Guid? endpointId, CancellationToken cancellationToken)
    {
        var actor = currentUser.AccountId
            ?? throw new AppException("Sending a robot needs a signed-in account.", 401, "unauthenticated");
        var operation = await ActiveAsync(transportRequestId, cancellationToken);
        if (operation.Items.All(i => i.JobId != jobId))
        {
            throw new NotFoundException("This Job is not part of the cancellation.", "cancellation_job_not_found");
        }

        var code = await jobControl.SendCancelledCargoToRecoveryAsync(jobId, endpointId, actor, cancellationToken);
        db.ChangeTracker.Clear();
        operation = await db.TransportCancellations.Include(c => c.Items).FirstAsync(c => c.Id == operation.Id, cancellationToken);
        var item = operation.Items.First(i => i.JobId == jobId);
        item.RecoveryPointCode = code;
        item.UpdatedAt = Now;
        operation.Version++;
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Cancellation {CancellationId}: Job {JobNo} takes its cargo to recovery point {Code}", operation.Id, item.JobNo, code);
        return await RefreshAsync(operation, cancellationToken);
    }

    /// <summary>A person is asked to come and unload the robot where it holds still; the staff see it as an issue.</summary>
    public async Task<CancellationResponse> RequestManualHandoverAsync(Guid transportRequestId, Guid jobId, string? note, CancellationToken cancellationToken)
    {
        var actor = currentUser.AccountId
            ?? throw new AppException("Asking for a handover needs a signed-in account.", 401, "unauthenticated");
        var operation = await ActiveAsync(transportRequestId, cancellationToken);
        var item = operation.Items.FirstOrDefault(i => i.JobId == jobId)
            ?? throw new NotFoundException("This Job is not part of the cancellation.", "cancellation_job_not_found");
        if (!item.Containers.Any(c => c.JobContainerStatus == "ONBOARD"))
        {
            throw new ConflictException("Nothing is on the robot any more.", "no_cargo_onboard");
        }

        if (item.HandoverRequestedAt is null)
        {
            item.HandoverRequestedAt = Now;
            item.HandoverRequestedBy = actor;
            item.UpdatedAt = Now;
            operation.Version++;
            await db.SaveChangesAsync(cancellationToken);

            var onboard = item.Containers.Where(c => c.JobContainerStatus == "ONBOARD").ToList();
            var barcodes = await BarcodesAsync(onboard.Select(c => c.ContainerId).ToList(), cancellationToken);
            var where = item.RecoveryPointCode is { } point && item.Phase == CancelRobotPhases.AtRecovery ? $" at recovery point {point}" : " where it stands";
            if (issues is not null)
            {
                try
                {
                    await issues.ReportAsync(
                        new SystemIssueDraft(
                            $"cancel-handover:{operation.Id:N}:{item.JobId:N}",
                            item.JobId,
                            item.JobNo,
                            actor,
                            item.RobotId,
                            onboard.Count == 1 ? onboard[0].ContainerId : null,
                            $"Request cancelled: unload robot {item.RobotCode ?? "?"}{where}. It holds still with "
                            + $"{string.Join(", ", onboard.Select(c => barcodes.GetValueOrDefault(c.ContainerId) ?? c.ContainerId.ToString()))}. "
                            + "Scan each container off in the app (Unload By Scan) and put it on a shelf."
                            + (string.IsNullOrWhiteSpace(note) ? string.Empty : $" Note: {Trim(note.Trim())}"),
                            High: false,
                            TransportRequestId: operation.TransportRequestId),
                        cancellationToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogWarning(ex, "Could not open the handover issue for cancellation {CancellationId}", operation.Id);
                }
            }
        }

        return await RefreshAsync(operation, cancellationToken);
    }

    /// <summary>
    /// Destination policy once a Job of the cancellation is over: its robot goes to parking (to the nearer of a wait
    /// point and parking when it was on its way to a pickup). Tried again on each refresh for a while, then given up
    /// with a note: a robot that is held, lost or busy is never forced.
    /// </summary>
    private async Task SendRobotOnAsync(TransportCancellationItem item, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (DestinationStatuses.IsSettled(item.DestinationStatus))
        {
            return;
        }

        void Settle(string status, string? code, string? note)
        {
            if (item.DestinationStatus == status && item.DestinationEndpointCode == code && item.DestinationNote == note)
            {
                return;
            }

            item.DestinationStatus = status;
            item.DestinationEndpointCode = code;
            item.DestinationNote = note is null ? null : note.Length > 200 ? note[..200] : note;
            item.UpdatedAt = now;
        }

        if (!Options.SendRobotsToParking)
        {
            Settle(DestinationStatuses.Off, null, null);
            return;
        }

        if (item.RobotId is not { } robotId)
        {
            Settle(DestinationStatuses.NotNeeded, null, "no_robot");
            return;
        }

        RobotDestinationResult result;
        try
        {
            result = await jobControl.SendRobotAfterCancelAsync(robotId, item.InitialPhase == CancelRobotPhases.ToPickup, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            result = new RobotDestinationResult(RobotDestinationResult.Retry, null, ex is AppException app ? app.Code : "error");
        }

        switch (result.Status)
        {
            case RobotDestinationResult.Sent:
                Settle(DestinationStatuses.Sent, result.EndpointCode, null);
                logger.LogInformation("Cancellation: robot {RobotCode} of Job {JobNo} sent to {Endpoint}", item.RobotCode, item.JobNo, result.EndpointCode);
                break;
            case RobotDestinationResult.NotNeeded:
                Settle(DestinationStatuses.NotNeeded, result.EndpointCode, result.Note);
                break;
            case RobotDestinationResult.Skipped:
                Settle(DestinationStatuses.Skipped, result.EndpointCode, result.Note);
                break;
            default:
                var since = item.DoneAt ?? now;
                Settle(
                    (now - since).TotalSeconds >= Math.Max(0, Options.ParkingRetrySeconds) ? DestinationStatuses.Skipped : DestinationStatuses.Pending,
                    result.EndpointCode,
                    result.Note);
                break;
        }
    }

    /// <summary>The next steps open for one robot, and why the others are not (the UI shows both).</summary>
    private (IReadOnlyList<string> Actions, IReadOnlyDictionary<string, string> Blocked) ActionsFor(
        TransportCancellation operation, TransportCancellationItem item, RequestJobCancellationView? job)
    {
        var actions = new List<string>();
        var blocked = new Dictionary<string, string>();
        var onboard = item.Containers.Any(c => c.JobContainerStatus == "ONBOARD");
        if (!operation.IsActive || !onboard || job is null || job.Status is not ("PAUSED" or "RECOVERY_REQUIRED"))
        {
            if (operation.IsActive && onboard && job?.Phase == CancelRobotPhases.ToRecovery)
            {
                blocked[CancellationActions.ContinueDelivery] = "robot_driving_to_recovery";
                blocked[CancellationActions.UnloadByScan] = "robot_driving_to_recovery";
            }

            return (actions, blocked);
        }

        var held = job.RobotMotionHeld || !job.RobotOnline;
        if (held)
        {
            actions.Add(CancellationActions.UnloadByScan);
        }
        else
        {
            blocked[CancellationActions.UnloadByScan] = "robot_not_stopped";
        }

        if (item.HandoverRequestedAt is null)
        {
            actions.Add(CancellationActions.RequestManualHandover);
        }
        else
        {
            blocked[CancellationActions.RequestManualHandover] = "already_requested";
        }

        string? cannotDrive = job.Status == "RECOVERY_REQUIRED" ? "needs_technician"
            : !job.RobotOnline ? "robot_offline"
            : !job.RobotLocalized ? "robot_not_localized"
            : !job.RobotTelemetryFresh ? "robot_telemetry_stale"
            : null;
        if (cannotDrive is not null)
        {
            blocked[CancellationActions.ContinueDelivery] = cannotDrive;
            blocked[CancellationActions.SendToRecovery] = cannotDrive;
            return (actions, blocked);
        }

        if (job.Phase == CancelRobotPhases.AtDropoff || Options.AllowsDelivery(operation.ReasonCode))
        {
            actions.Add(CancellationActions.ContinueDelivery);
        }
        else
        {
            blocked[CancellationActions.ContinueDelivery] = "reason_forbids_delivery";
        }

        if (job.Phase == CancelRobotPhases.AtRecovery)
        {
            blocked[CancellationActions.SendToRecovery] = "already_at_recovery_point";
        }
        else if (job.Phase == CancelRobotPhases.AtDropoff)
        {
            blocked[CancellationActions.SendToRecovery] = "at_dropoff_reconcile_first";
        }
        else if (!job.CanSendToRecovery)
        {
            blocked[CancellationActions.SendToRecovery] = "recovery_needs_move";
        }
        else
        {
            actions.Add(CancellationActions.SendToRecovery);
        }

        return (actions, blocked);
    }

    // ------------------------------------------------------------------ evaluation

    private async Task<CancellationResponse> RefreshAsync(TransportCancellation operation, CancellationToken cancellationToken)
    {
        var view = await jobControl.GetCancellationViewAsync(operation.TransportRequestId, cancellationToken);
        if (!operation.IsActive)
        {
            return await BuildAsync(operation, view, cancellationToken);
        }

        var targets = await TargetContainersAsync(operation, cancellationToken);
        var now = Now;

        // Every Job carrying a target container is followed, also one provisioned after the first look.
        foreach (var job in view.Where(j => j.Containers.Any(c => targets.Contains(c.ContainerId))))
        {
            if (operation.Items.All(i => i.JobId != job.JobId))
            {
                var item = new TransportCancellationItem
                {
                    Id = Guid.NewGuid(),
                    CancellationId = operation.Id,
                    JobId = job.JobId,
                    JobNo = job.JobNo,
                    RobotId = job.RobotId,
                    RobotCode = job.RobotCode,
                    Stage = CancellationStages.Pending,
                    InitialPhase = _phasesBeforeCancel?.GetValueOrDefault(job.JobId) ?? job.Phase,
                    UpdatedAt = now
                };
                operation.Items.Add(item);
                db.TransportCancellationItems.Add(item);
            }
        }

        var cancelledAfterPickup = view.SelectMany(j => j.Containers)
            .Where(c => targets.Contains(c.ContainerId) && c.Status == "CANCELLED" && c.LoadedAt is not null
                        && c.FailureCode != CancellationProgress.CancelHandedOverCode)
            .Select(c => c.ContainerId)
            .ToList();
        var inTransit = cancelledAfterPickup.Count == 0
            ? new HashSet<Guid>()
            : (await warehouse.GetContainersAsync(cancelledAfterPickup, cancellationToken))
                .Where(c => c.Status == ContainerStatus.IN_TRANSIT)
                .Select(c => c.Id)
                .ToHashSet();

        var stages = new List<string>();
        foreach (var item in operation.Items)
        {
            var job = view.FirstOrDefault(j => j.JobId == item.JobId);
            if (job is null)
            {
                stages.Add(item.Stage);
                continue;
            }

            var before = item.Stage;
            var beforeContainers = string.Join(';', item.Containers.Select(c => $"{c.ContainerId}:{c.JobContainerStatus}:{c.Resolution}"));
            var stage = CancellationProgress.EvaluateItem(item, job, targets, inTransit, operation.RequestedAt, now);
            var afterContainers = string.Join(';', item.Containers.Select(c => $"{c.ContainerId}:{c.JobContainerStatus}:{c.Resolution}"));
            if (stage != before || beforeContainers != afterContainers)
            {
                item.UpdatedAt = now;
            }

            stages.Add(stage);
            if (stage is CancellationStages.Manual or CancellationStages.SafeStop && before != stage)
            {
                await ReportManualAsync(operation, item, job, cancellationToken);
            }

            if (stage == CancellationStages.Done)
            {
                item.DoneAt ??= now;
                await SendRobotOnAsync(item, now, cancellationToken);
            }
        }

        // A request whose details were all cancelled before any Job existed has no items: nothing to wait for.
        var status = CancellationProgress.Overall(stages);
        if (status == CancellationStatuses.Finalized && operation.Scope == CancellationScopes.Request)
        {
            var request = await db.TransportRequests.AsNoTracking().FirstAsync(r => r.Id == operation.TransportRequestId, cancellationToken);
            if (request.Status == TransportRequestStatus.CANCELLING)
            {
                // The details catch up through their container events; until then the request is not closed.
                status = CancellationStatuses.Recovering;
            }
        }

        // Destination policy: the robots of finished Jobs are on their way to parking before it is closed.
        if (status == CancellationStatuses.Finalized && operation.Items.Any(i => i.DestinationStatus == DestinationStatuses.Pending))
        {
            status = CancellationStatuses.ParkingRobots;
        }

        var changed = status != operation.Status;
        if (changed)
        {
            operation.Status = status;
            operation.UpdatedAt = now;
            if (status == CancellationStatuses.Finalized)
            {
                operation.FinalizedAt = now;
            }
        }

        if (db.ChangeTracker.HasChanges())
        {
            operation.Version++;
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                // Someone refreshed it at the same moment from the same facts; their write stands.
                db.ChangeTracker.Clear();
                var fresh = await db.TransportCancellations.AsNoTracking().Include(c => c.Items).FirstAsync(c => c.Id == operation.Id, cancellationToken);
                return await BuildAsync(fresh, view, cancellationToken);
            }
        }

        await EnsureHandoverPostingsAsync(operation, cancellationToken);
        if (changed)
        {
            logger.LogInformation("Cancellation {CancellationId} of request {RequestId} → {Status}", operation.Id, operation.TransportRequestId, status);
            var code = await db.TransportRequests.AsNoTracking().Where(r => r.Id == operation.TransportRequestId)
                .Select(r => r.RequestCode).FirstAsync(cancellationToken);
            await events.PublishAsync(
                new TransportCancellationProgressed(
                    operation.Id, operation.TransportRequestId, code, operation.Scope, status, operation.ReasonCode, operation.RequestedBy),
                cancellationToken);
        }

        return await BuildAsync(operation, view, cancellationToken);
    }

    /// <summary>Containers unloaded by hand are posted to Warehouse (ordered after their pickup). A lost write is queued again here.</summary>
    private async Task EnsureHandoverPostingsAsync(TransportCancellation operation, CancellationToken cancellationToken)
    {
        var handovers = operation.Items.SelectMany(item => item.Containers
            .Where(box => box.Resolution == ContainerResolutions.HandedOver && box.StorageLocationId is not null)
            .Select(box => (item.JobId, Box: box))).ToArray();
        if (handovers.Length == 0) return;

        var queued = new List<StockPosting>();
        TransportRequest request;
        var detailsChanged = false;
        await using (var transaction = await TransportRequestWriteLock.AcquireAsync(db, operation.TransportRequestId, cancellationToken))
        {
            // The caller may have loaded the request before another reader queued a handover.
            if (db.TransportRequests.Local.FirstOrDefault(item => item.Id == operation.TransportRequestId) is { } tracked)
            {
                foreach (var detail in tracked.Details.ToArray())
                    db.Entry(detail).State = EntityState.Detached;
                db.Entry(tracked).State = EntityState.Detached;
            }
            request = await LoadRequestAsync(operation.TransportRequestId, cancellationToken);
            var now = Now;
            var existingKeys = (await db.StockPostings.AsNoTracking()
                .Where(posting => posting.TransportRequestId == request.Id && posting.Type == StockPostingType.CANCEL_HANDOVER)
                .Select(posting => posting.Key).ToListAsync(cancellationToken)).ToHashSet(StringComparer.Ordinal);
            var details = request.Details.ToDictionary(detail => detail.ContainerId);
            foreach (var (jobId, box) in handovers)
            {
                var key = $"{jobId:N}:{box.ContainerId:N}:{StockPostingType.CANCEL_HANDOVER}";
                if (existingKeys.Add(key))
                {
                    var posting = new StockPosting
                    {
                        Id = Guid.NewGuid(),
                        Key = key,
                        Type = StockPostingType.CANCEL_HANDOVER,
                        ContainerId = box.ContainerId,
                        JobId = jobId,
                        TransportRequestId = request.Id,
                        DestinationStorageLocationId = box.StorageLocationId,
                        DestinationLevelNo = box.LevelNo ?? 1,
                        ActorAccountId = box.HandedOverBy,
                        CreatedAt = box.HandedOverAt ?? now
                    };
                    db.StockPostings.Add(posting);
                    queued.Add(posting);
                }

                if (details.TryGetValue(box.ContainerId, out var detail) && !TransportRequest.IsTerminal(detail.Status))
                {
                    detail.Status = TransportRequestDetailStatus.CANCELLED;
                    detail.UpdatedAt = now;
                    detailsChanged = true;
                }
            }

            if (detailsChanged)
                request.ApplyDetailProgress(now);
            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null)
                await transaction.CommitAsync(cancellationToken);
        }

        foreach (var posting in queued)
            await postings.PostNowAsync(posting, cancellationToken);
        if (detailsChanged)
            await events.PublishAsync(TransportRequestEvents.Progressed(request), cancellationToken);
    }

    private async Task ReportManualAsync(
        TransportCancellation operation, TransportCancellationItem item, RequestJobCancellationView job, CancellationToken cancellationToken)
    {
        if (issues is null)
        {
            return;
        }

        var unrecovered = item.Containers.Count(c => c.Resolution == ContainerResolutions.Unrecovered);
        var description = item.Stage == CancellationStages.SafeStop
            ? $"Request cancelled while robot {job.RobotCode ?? "?"} (Job {job.JobNo}) carried cargo, and the robot cannot drive safely "
              + "(it is not localized). It holds still (safe stop). Technician: check the robot and localize it; the cargo can be unloaded by scan meanwhile."
            : unrecovered > 0
            ? $"Job {job.JobNo} was cancelled with {unrecovered} container(s) on the robot and nobody unloaded them by scan. "
              + "Warehouse still has them in transit: find them and recover each one to the shelf it is on."
            : $"The cancellation of Job {job.JobNo} cannot finish by itself (Job {job.Status}, robot {job.RobotCode ?? "none"}). "
              + "Check the robot and the cargo on it.";
        try
        {
            await issues.ReportAsync(
                new SystemIssueDraft(
                    $"cancel-manual:{operation.Id:N}:{item.JobId:N}",
                    job.JobId,
                    job.JobNo,
                    null,
                    job.RobotId,
                    item.Containers.Count == 1 ? item.Containers[0].ContainerId : null,
                    description,
                    High: true,
                    TransportRequestId: operation.TransportRequestId),
                cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not open the manual-intervention issue for cancellation {CancellationId}", operation.Id);
        }
    }

    private async Task<CancellationResponse> BuildAsync(
        TransportCancellation operation, IReadOnlyList<RequestJobCancellationView> view, CancellationToken cancellationToken)
    {
        var barcodes = await BarcodesAsync(operation.Items.SelectMany(i => i.Containers).Select(c => c.ContainerId).ToList(), cancellationToken);
        var items = operation.Items.OrderBy(i => i.JobNo).Select(item =>
        {
            var job = view.FirstOrDefault(j => j.JobId == item.JobId);
            var onboard = item.Containers.Any(c => c.JobContainerStatus == "ONBOARD");
            var held = job is not null && (job.RobotMotionHeld || !job.RobotOnline);
            var jobHeld = job?.Status is "PAUSED" or "RECOVERY_REQUIRED";
            var (actions, blocked) = ActionsFor(operation, item, job);
            return new CancellationItemResponse(
                item.JobId,
                item.JobNo,
                job?.Status ?? "UNKNOWN",
                item.RobotId,
                item.RobotCode,
                job?.RobotOnline ?? false,
                job?.RobotMotionHeld ?? false,
                item.Stage,
                operation.IsActive && onboard && held && jobHeld,
                operation.IsActive && onboard && job is { RobotOnline: true, Status: "PAUSED" },
                item.Containers.Select(c => new CancellationContainerResponse(
                    c.ContainerId,
                    barcodes.GetValueOrDefault(c.ContainerId),
                    c.JobContainerStatus,
                    c.Resolution,
                    c.StorageLocationId,
                    c.LevelNo,
                    c.HandedOverAt)).ToList(),
                item.Phase ?? job?.Phase,
                item.InitialPhase,
                job?.RobotLocalized ?? false,
                item.RecoveryPointCode,
                item.HandoverRequestedAt,
                item.DestinationStatus,
                item.DestinationEndpointCode,
                item.DestinationNote,
                actions,
                blocked);
        }).ToList();

        var all = operation.Items.SelectMany(i => i.Containers).ToList();
        return new CancellationResponse(
            operation.Id,
            operation.TransportRequestId,
            operation.Scope,
            operation.TargetDetailIds,
            operation.Status,
            operation.ReasonCode,
            operation.Reason,
            operation.RequestedBy,
            operation.RequestedAt,
            operation.FinalizedAt,
            operation.LastError,
            all.Count(c => c.Resolution == ContainerResolutions.Delivered),
            all.Count(c => c.Resolution == ContainerResolutions.HandedOver),
            all.Count(c => c.Resolution == ContainerResolutions.NotPickedUp),
            all.Count(c => c.JobContainerStatus == "ONBOARD"),
            all.Count(c => c.Resolution == ContainerResolutions.Unrecovered)
                + operation.Items.Count(i => i.Stage is CancellationStages.Manual or CancellationStages.WaitingRobot or CancellationStages.SafeStop),
            items);
    }

    // ------------------------------------------------------------------ helpers

    private async Task<HashSet<Guid>> TargetContainersAsync(TransportCancellation operation, CancellationToken cancellationToken)
    {
        var details = db.TransportRequestDetails.AsNoTracking().Where(d => d.TransportRequestId == operation.TransportRequestId);
        if (operation.Scope == CancellationScopes.Details && operation.TargetDetailIds is { } ids)
        {
            details = details.Where(d => ids.Contains(d.Id));
        }

        return (await details.Select(d => d.ContainerId).ToListAsync(cancellationToken)).ToHashSet();
    }

    private static void SetContainer(TransportCancellationItem item, Guid containerId, Action<CancellationContainer> change)
    {
        // The list is one JSON column: replace it, so the change is seen.
        var copy = item.Containers.Select(c => new CancellationContainer
        {
            ContainerId = c.ContainerId,
            JobContainerStatus = c.JobContainerStatus,
            Resolution = c.Resolution,
            StorageLocationId = c.StorageLocationId,
            LevelNo = c.LevelNo,
            ScannedBarcode = c.ScannedBarcode,
            HandedOverBy = c.HandedOverBy,
            HandedOverAt = c.HandedOverAt
        }).ToList();
        change(copy.First(c => c.ContainerId == containerId));
        item.Containers = copy;
    }

    private async Task<TransportCancellation> ActiveAsync(Guid transportRequestId, CancellationToken cancellationToken)
    {
        var active = await db.TransportCancellations.Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.TransportRequestId == transportRequestId && c.Status != CancellationStatuses.Finalized, cancellationToken);
        if (active is not null)
        {
            return active;
        }

        // A cancel from before TRN-03: create its record, then use it.
        if (await GetAsync(transportRequestId, cancellationToken) is { } created && created.Status != CancellationStatuses.Finalized)
        {
            db.ChangeTracker.Clear();
            return await db.TransportCancellations.Include(c => c.Items).FirstAsync(c => c.Id == created.Id, cancellationToken);
        }

        throw new ConflictException("This request has no cancellation in progress.", "no_active_cancellation");
    }

    private Task<TransportCancellation?> LatestAsync(Guid transportRequestId, CancellationToken cancellationToken) =>
        db.TransportCancellations.Include(c => c.Items)
            .Where(c => c.TransportRequestId == transportRequestId)
            .OrderByDescending(c => c.Status != CancellationStatuses.Finalized)
            .ThenByDescending(c => c.RequestedAt)
            .FirstOrDefaultAsync(cancellationToken);

    private async Task<Dictionary<Guid, string>> BarcodesAsync(IReadOnlyCollection<Guid> containerIds, CancellationToken cancellationToken) =>
        containerIds.Count == 0
            ? []
            : (await warehouse.GetContainersAsync(containerIds.Distinct().ToList(), cancellationToken)).ToDictionary(c => c.Id, c => c.Barcode);

    private async Task<TransportRequest> LoadRequestAsync(Guid id, CancellationToken cancellationToken) =>
        await db.TransportRequests.Include(r => r.Details).FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
        ?? throw new NotFoundException($"TransportRequest '{id}' was not found.", "transport_request_not_found");

    private static string RequireReason(string? value)
    {
        var reason = value?.Trim();
        if (string.IsNullOrEmpty(reason))
        {
            throw new DomainValidationException("Give a reason.", "reason_required");
        }

        return reason.Length > 500 ? reason[..500] : reason;
    }

    private static string Trim(string message) => message.Length > 500 ? message[..500] : message;
}

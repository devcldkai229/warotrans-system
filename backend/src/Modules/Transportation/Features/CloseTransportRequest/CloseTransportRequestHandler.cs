using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.Cancellation;
using WaroTrans.Transportation.Features.GetTransportRequest;
using WaroTrans.Transportation.Features.Shared;
using WaroTrans.Transportation.IntegrationEvents;
using WaroTrans.Transportation.Persistence;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Features.CloseTransportRequest;

/// <param name="ReasonCode">TRN-03 cancel only: why, as a code (OPERATOR_REQUESTED by default).</param>
/// <param name="IdempotencyKey">TRN-03 cancel only: the same key returns the same cancellation.</param>
/// <param name="DetailIds">TRN-03 cancel only: cancel just these details, before they are picked up.</param>
public sealed record CloseTransportRequestRequest(
    string? Reason,
    string? ReasonCode = null,
    string? IdempotencyKey = null,
    IReadOnlyList<Guid>? DetailIds = null);

/// <summary>
/// TRN-01 cancel and TRN-02 reject. Both are idempotent: repeating the same call answers with the current request and
/// does nothing twice. The request is marked first, then its Jobs are told, so container events arriving meanwhile
/// already see the new state.
/// </summary>
public sealed class CloseTransportRequestHandler(
    TransportationDbContext db,
    ITransportRequestJobControl jobControl,
    ICurrentUser currentUser,
    IIntegrationEventPublisher events,
    GetTransportRequestHandler reader,
    TransportCancellationService cancellations,
    ILogger<CloseTransportRequestHandler> logger)
{
    /// <summary>
    /// TRN-01 / TRN-03: the cancel is a long-running cancellation (<see cref="TransportCancellationService"/>); this
    /// answers with the request as it stands right after the Jobs were told. Follow the rest through
    /// GET /transport-requests/{id}/cancellation.
    /// </summary>
    public async Task<GetTransportRequestResponse> CancelAsync(Guid id, CloseTransportRequestRequest body, CancellationToken cancellationToken)
    {
        await cancellations.RequestAsync(
            id,
            new CancelTransportRequestBody(body.Reason, body.ReasonCode, body.IdempotencyKey, body.DetailIds),
            cancellationToken);
        return await reader.HandleAsync(id, cancellationToken);
    }

    public async Task<GetTransportRequestResponse> RejectAsync(Guid id, CloseTransportRequestRequest body, CancellationToken cancellationToken)
    {
        var reason = RequireReason(body);
        var request = await LoadAsync(id, cancellationToken);
        if (request.Status == TransportRequestStatus.REJECTED)
        {
            return await reader.HandleAsync(id, cancellationToken);
        }

        var jobs = await JobsOfAsync(id, cancellationToken);
        Guard(TransportRequestActionPolicy.Reject, request, jobs);

        request.Reject(currentUser.AccountId, reason, DateTimeOffset.UtcNow);
        await db.SaveChangesAsync(cancellationToken);

        // A queued request already has Jobs; none of them ran (the guard), so cancelling them changes nothing physical.
        if (jobs.Count > 0)
        {
            await jobControl.CancelForRequestAsync(id, $"Request rejected: {reason}", cancellationToken);
        }

        logger.LogInformation("TransportRequest {RequestCode} rejected by {Actor}: {Reason}", request.RequestCode, currentUser.Username, reason);
        await events.PublishAsync(TransportRequestEvents.Progressed(request), cancellationToken);
        await events.PublishAsync(
            new TransportRequestClosedByOperator(
                request.Id, request.RequestCode, request.Status, request.RequestedBy, currentUser.AccountId, reason, 0),
            cancellationToken);
        return await reader.HandleAsync(id, cancellationToken);
    }

    private static string RequireReason(CloseTransportRequestRequest body)
    {
        var reason = body.Reason?.Trim();
        if (string.IsNullOrEmpty(reason))
        {
            throw new DomainValidationException("Give a reason.", "reason_required");
        }

        return reason.Length > 500 ? reason[..500] : reason;
    }

    private static void Guard(string action, TransportRequest request, IReadOnlyList<RequestJobState> jobs)
    {
        if (TransportRequestActionPolicy.StateReason(action, request, jobs) is { } refused)
        {
            var verb = action == TransportRequestActionPolicy.Reject ? "rejected" : "cancelled";
            throw new ConflictException($"TransportRequest {request.RequestCode} cannot be {verb} while {request.Status}.", refused);
        }
    }

    private async Task<IReadOnlyList<RequestJobState>> JobsOfAsync(Guid id, CancellationToken cancellationToken) =>
        (await jobControl.GetJobsAsync([id], cancellationToken)).GetValueOrDefault(id) ?? [];

    private async Task<TransportRequest> LoadAsync(Guid id, CancellationToken cancellationToken) =>
        await db.TransportRequests.Include(r => r.Details).FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
        ?? throw new NotFoundException($"TransportRequest '{id}' was not found.", "transport_request_not_found");
}

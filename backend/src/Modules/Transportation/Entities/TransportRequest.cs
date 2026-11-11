using System.Text.Json;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Transportation.Enums;

namespace WaroTrans.Transportation.Entities;

/// <summary>
/// Runtime: one TransportRequest maps to N Jobs via JobContainer; movement plan is TransportRequestDetail.
/// </summary>
public sealed class TransportRequest
{
    public const int CurrentPlanSchemaVersion = 1;

    public Guid Id { get; set; }
    public string RequestCode { get; set; } = string.Empty;
    public Guid WarehouseId { get; set; }
    public Guid MapVersionId { get; set; }
    public Guid WorkflowId { get; set; }
    public Guid RequestedBy { get; set; }
    public TransportRequestStatus Status { get; set; }
    public int PlanSchemaVersion { get; set; }
    public Dictionary<string, JsonElement>? WorkflowInputs { get; set; }
    public string? Note { get; set; }

    /// <summary>FL-07: -1 low, 0 normal, 1 high. Its Jobs inherit it.</summary>
    public int Priority { get; set; }

    /// <summary>FL-07: when this should be done by. It moves the Jobs up the queue; nothing happens by itself when it passes.</summary>
    public DateTimeOffset? DeadlineAt { get; set; }
    public DateTimeOffset SubmittedAt { get; set; }
    public DateTimeOffset? QueuedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? FailureCode { get; set; }
    public string? FailureMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long Version { get; set; }

    /// <summary>TRN-01: who cancelled the request and why (set when the cancel was accepted).</summary>
    public Guid? CancelledBy { get; set; }
    public string? CancelReason { get; set; }
    public DateTimeOffset? CancelRequestedAt { get; set; }

    /// <summary>TRN-02: who rejected the request and why.</summary>
    public Guid? RejectedBy { get; set; }
    public string? RejectReason { get; set; }
    public DateTimeOffset? RejectedAt { get; set; }

    public ICollection<TransportRequestDetail> Details { get; set; } = [];

    /// <summary>Nothing more will happen to this request.</summary>
    public bool IsClosed =>
        Status is TransportRequestStatus.COMPLETED or TransportRequestStatus.FAILED or TransportRequestStatus.CANCELLED
            or TransportRequestStatus.REJECTED
        || (Status == TransportRequestStatus.PARTIALLY_COMPLETED && CompletedAt is not null);

    public static bool IsTerminal(TransportRequestDetailStatus status) =>
        status is TransportRequestDetailStatus.COMPLETED or TransportRequestDetailStatus.FAILED or TransportRequestDetailStatus.CANCELLED;

    /// <summary>
    /// Re-aggregates the Request status from its Detail lines (rules/02, WH-04).
    /// Every Detail terminal: all COMPLETED → COMPLETED; some COMPLETED → PARTIALLY_COMPLETED (closed);
    /// none COMPLETED → CANCELLED when the request was being cancelled or all are CANCELLED, otherwise FAILED.
    /// Some still open: a CANCELLING request stays CANCELLING; some COMPLETED/FAILED → PARTIALLY_COMPLETED;
    /// any IN_PROGRESS → IN_PROGRESS. CANCELLED / REJECTED requests are not touched.
    /// </summary>
    public void ApplyDetailProgress(DateTimeOffset now)
    {
        if (Status is TransportRequestStatus.CANCELLED or TransportRequestStatus.REJECTED || Details.Count == 0)
        {
            return;
        }

        var statuses = Details.Select(d => d.Status).ToList();
        bool All(TransportRequestDetailStatus s) => statuses.All(x => x == s);
        bool Any(TransportRequestDetailStatus s) => statuses.Contains(s);
        var allTerminal = statuses.All(IsTerminal);

        var next = Status;
        if (allTerminal)
        {
            next = All(TransportRequestDetailStatus.COMPLETED) ? TransportRequestStatus.COMPLETED
                : Any(TransportRequestDetailStatus.COMPLETED) ? TransportRequestStatus.PARTIALLY_COMPLETED
                : Status == TransportRequestStatus.CANCELLING || All(TransportRequestDetailStatus.CANCELLED) ? TransportRequestStatus.CANCELLED
                : TransportRequestStatus.FAILED;
        }
        else if (Status == TransportRequestStatus.CANCELLING)
        {
            // Waiting for the cargo on a robot to be recovered.
        }
        else if (Any(TransportRequestDetailStatus.COMPLETED) || Any(TransportRequestDetailStatus.FAILED))
        {
            next = TransportRequestStatus.PARTIALLY_COMPLETED;
        }
        else if (Any(TransportRequestDetailStatus.IN_PROGRESS) || Any(TransportRequestDetailStatus.CANCEL_PENDING_RECOVERY))
        {
            next = TransportRequestStatus.IN_PROGRESS;
        }

        var closesNow = allTerminal && CompletedAt is null;
        if (next == Status && !closesNow)
        {
            return;
        }

        Status = next;
        UpdatedAt = now;
        if (allTerminal)
        {
            CompletedAt ??= now;
        }
    }

    /// <summary>
    /// TRN-01 / WH-04: applies what cancelling did to each container. Containers whose Job has cargo on a robot wait
    /// in CANCEL_PENDING_RECOVERY (nothing is treated as returned); every other open Detail is CANCELLED. The request
    /// is CANCELLING until the last Detail is terminal, then aggregates (CANCELLED, or PARTIALLY_COMPLETED when some
    /// containers had already been delivered).
    /// </summary>
    public void ApplyCancel(Guid? actor, string reason, IReadOnlySet<Guid> containersInRecovery, DateTimeOffset now)
    {
        CancelledBy = actor;
        CancelReason = reason;
        CancelRequestedAt = now;
        foreach (var detail in Details.Where(d => !IsTerminal(d.Status)))
        {
            var next = containersInRecovery.Contains(detail.ContainerId)
                ? TransportRequestDetailStatus.CANCEL_PENDING_RECOVERY
                : TransportRequestDetailStatus.CANCELLED;
            if (detail.Status != next)
            {
                detail.Status = next;
                detail.UpdatedAt = now;
            }
        }

        Status = TransportRequestStatus.CANCELLING;
        UpdatedAt = now;
        ApplyDetailProgress(now);
    }

    /// <summary>TRN-02: the request is refused before anything moved. Its Details are cancelled; no Job runs it.</summary>
    public void Reject(Guid? actor, string reason, DateTimeOffset now)
    {
        RejectedBy = actor;
        RejectReason = reason;
        RejectedAt = now;
        foreach (var detail in Details.Where(d => !IsTerminal(d.Status)))
        {
            detail.Status = TransportRequestDetailStatus.CANCELLED;
            detail.UpdatedAt = now;
        }

        Status = TransportRequestStatus.REJECTED;
        UpdatedAt = now;
        CompletedAt = now;
    }

    /// <summary>
    /// Creates a SUBMITTED request with PENDING Details. Ids are generated here so the
    /// execution snapshot carries the same ids that will be persisted.
    /// </summary>
    public static TransportRequest Submit(
        string requestCode,
        Guid warehouseId,
        Guid mapVersionId,
        Guid workflowId,
        Guid requestedBy,
        Dictionary<string, JsonElement>? workflowInputs,
        string? note,
        IReadOnlyList<TransportRequestDetailDraft> details,
        DateTimeOffset now)
    {
        if (details.Count == 0)
        {
            throw new DomainValidationException(
                "A TransportRequest requires at least one Detail.",
                "details_required");
        }

        var sequenceNos = new HashSet<int>();
        var containerIds = new HashSet<Guid>();
        foreach (var detail in details)
        {
            if (detail.SequenceNo <= 0)
            {
                throw new DomainValidationException(
                    $"Detail SequenceNo must be positive (got {detail.SequenceNo}).",
                    "detail_sequence_invalid");
            }

            if (!sequenceNos.Add(detail.SequenceNo))
            {
                throw new DomainValidationException(
                    $"Duplicate Detail SequenceNo {detail.SequenceNo}.",
                    "duplicate_sequence_no");
            }

            if (!containerIds.Add(detail.ContainerId))
            {
                throw new DomainValidationException(
                    $"Container '{detail.ContainerId}' appears in more than one Detail.",
                    "duplicate_container_in_request");
            }
        }

        var request = new TransportRequest
        {
            Id = Guid.NewGuid(),
            RequestCode = requestCode,
            WarehouseId = warehouseId,
            MapVersionId = mapVersionId,
            WorkflowId = workflowId,
            RequestedBy = requestedBy,
            Status = TransportRequestStatus.SUBMITTED,
            PlanSchemaVersion = CurrentPlanSchemaVersion,
            WorkflowInputs = workflowInputs ?? [],
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
            SubmittedAt = now,
            CreatedAt = now,
            UpdatedAt = now
        };

        foreach (var detail in details.OrderBy(d => d.SequenceNo))
        {
            request.Details.Add(new TransportRequestDetail
            {
                Id = Guid.NewGuid(),
                TransportRequestId = request.Id,
                SequenceNo = detail.SequenceNo,
                ContainerId = detail.ContainerId,
                SourceStorageLocationId = detail.SourceStorageLocationId,
                SourceEndpointId = detail.SourceEndpointId,
                SourceLevelNo = detail.SourceLevelNo,
                DestinationStorageLocationId = detail.DestinationStorageLocationId,
                DestinationEndpointId = detail.DestinationEndpointId,
                DestinationLevelNo = detail.DestinationLevelNo,
                Status = TransportRequestDetailStatus.PENDING,
                CreatedAt = now,
                UpdatedAt = now,
                TransportRequest = request
            });
        }

        return request;
    }
}

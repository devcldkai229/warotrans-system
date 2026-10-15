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
    public DateTimeOffset SubmittedAt { get; set; }
    public DateTimeOffset? QueuedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? FailureCode { get; set; }
    public string? FailureMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long Version { get; set; }

    public ICollection<TransportRequestDetail> Details { get; set; } = [];

    /// <summary>
    /// Re-aggregates the Request status from its Detail lines (rules/02):
    /// all COMPLETED → COMPLETED; all FAILED → FAILED; some COMPLETED (or FAILED) with others still open or
    /// FAILED → PARTIALLY_COMPLETED; any IN_PROGRESS → IN_PROGRESS. CANCELLED / REJECTED requests are not touched.
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

        var next = Status;
        if (All(TransportRequestDetailStatus.COMPLETED))
        {
            next = TransportRequestStatus.COMPLETED;
        }
        else if (All(TransportRequestDetailStatus.FAILED))
        {
            next = TransportRequestStatus.FAILED;
        }
        else if (Any(TransportRequestDetailStatus.COMPLETED) || Any(TransportRequestDetailStatus.FAILED))
        {
            next = TransportRequestStatus.PARTIALLY_COMPLETED;
        }
        else if (Any(TransportRequestDetailStatus.IN_PROGRESS))
        {
            next = TransportRequestStatus.IN_PROGRESS;
        }

        if (next == Status)
        {
            return;
        }

        Status = next;
        UpdatedAt = now;
        if (next is TransportRequestStatus.COMPLETED or TransportRequestStatus.FAILED)
        {
            CompletedAt = now;
        }
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

using System.Text.Json;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Features.GetTransportRequest;

public sealed record GetTransportRequestResponse(
    Guid Id,
    string RequestCode,
    string Status,
    Guid WarehouseId,
    Guid MapVersionId,
    Guid WorkflowId,
    int PlanSchemaVersion,
    Guid RequestedBy,
    string? Note,
    IReadOnlyDictionary<string, JsonElement> WorkflowInputs,
    DateTimeOffset SubmittedAt,
    DateTimeOffset? QueuedAt,
    DateTimeOffset? CompletedAt,
    string? FailureCode,
    string? FailureMessage,
    IReadOnlyList<TransportRequestDetailItemResponse> Details,
    // TRN-01 / TRN-02: who closed the request and why.
    Guid? CancelledBy,
    string? CancelReason,
    DateTimeOffset? CancelRequestedAt,
    Guid? RejectedBy,
    string? RejectReason,
    DateTimeOffset? RejectedAt,
    // The Jobs carrying it and what the caller may do now (BOTH-04).
    IReadOnlyList<RequestJobState> Jobs,
    IReadOnlyList<ActionAvailability> AvailableActions,
    string? RequestedByName = null);

public sealed record TransportRequestDetailItemResponse(
    Guid Id,
    int SequenceNo,
    Guid ContainerId,
    string? ContainerBarcode,
    Guid? SourceStorageLocationId,
    string? SourceStorageLocationCode,
    Guid SourceEndpointId,
    string? SourceEndpointCode,
    string? SourceEndpointName,
    short? SourceLevelNo,
    Guid? DestinationStorageLocationId,
    string? DestinationStorageLocationCode,
    Guid DestinationEndpointId,
    string? DestinationEndpointCode,
    string? DestinationEndpointName,
    short? DestinationLevelNo,
    string Status);

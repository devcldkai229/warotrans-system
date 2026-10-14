using System.Text.Json;

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
    IReadOnlyList<TransportRequestDetailItemResponse> Details);

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

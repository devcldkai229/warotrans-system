using System.Text.Json;

namespace WaroTrans.Transportation.Features.CreateTransportRequest;

public sealed record CreateTransportRequestResponse(
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
    IReadOnlyList<TransportRequestDetailResponse> Details);

public sealed record TransportRequestDetailResponse(
    Guid Id,
    int SequenceNo,
    Guid ContainerId,
    Guid? SourceStorageLocationId,
    Guid SourceEndpointId,
    short? SourceLevelNo,
    Guid? DestinationStorageLocationId,
    Guid DestinationEndpointId,
    short? DestinationLevelNo,
    string Status);

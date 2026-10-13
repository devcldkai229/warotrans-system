using System.Text.Json;

namespace WaroTrans.Transportation.Features.CreateTransportRequest;

/// <summary>
/// Client body. Id, RequestCode, RequestedBy, Status and PlanSchemaVersion are generated server-side.
/// Movement data lives in Details; WorkflowInputs carries only the Workflow's STAFF_INPUT variables.
/// </summary>
public sealed record CreateTransportRequestRequest(
    Guid WarehouseId,
    Guid MapVersionId,
    Guid WorkflowId,
    Dictionary<string, JsonElement>? WorkflowInputs,
    string? Note,
    List<CreateTransportRequestDetailRequest>? Details);

public sealed record CreateTransportRequestDetailRequest(
    int SequenceNo,
    Guid ContainerId,
    Guid? SourceStorageLocationId,
    Guid SourceEndpointId,
    short? SourceLevelNo,
    Guid? DestinationStorageLocationId,
    Guid DestinationEndpointId,
    short? DestinationLevelNo);

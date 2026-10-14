namespace WaroTrans.Transportation.Features.ListTransportRequests;

public sealed record TransportRequestListItemResponse(
    Guid Id,
    string RequestCode,
    string Status,
    Guid WarehouseId,
    Guid MapVersionId,
    Guid WorkflowId,
    Guid RequestedBy,
    string? Note,
    DateTimeOffset SubmittedAt,
    int DetailCount,
    IReadOnlyList<TransportRequestListDetailSummary> Details);

public sealed record TransportRequestListDetailSummary(
    Guid Id,
    int SequenceNo,
    Guid ContainerId,
    string? ContainerBarcode,
    Guid SourceEndpointId,
    string? SourceEndpointCode,
    Guid DestinationEndpointId,
    string? DestinationEndpointCode,
    string Status);

public sealed record ListTransportRequestsResponse(
    IReadOnlyList<TransportRequestListItemResponse> Items,
    int Total);

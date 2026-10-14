using WaroTrans.Transportation.Enums;

namespace WaroTrans.Transportation.Features.ListTransportRequests;

public sealed record ListTransportRequestsRequest(
    Guid? WarehouseId,
    TransportRequestStatus? Status,
    string? Search,
    int Take);

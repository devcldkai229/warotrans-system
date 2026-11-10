using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.IntegrationEvents;

namespace WaroTrans.Transportation.Features.Shared;

public static class TransportRequestEvents
{
    public static TransportRequestProgressed Progressed(TransportRequest request, TransportRequestDetail? detail = null) =>
        new(
            request.Id,
            request.RequestCode,
            request.Status,
            request.Details.Count,
            request.Details.Count(d => d.Status == TransportRequestDetailStatus.COMPLETED),
            request.Details.Count(d => d.Status == TransportRequestDetailStatus.FAILED),
            detail?.ContainerId,
            detail?.Status.ToString());
}

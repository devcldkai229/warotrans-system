using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Transportation.Enums;

namespace WaroTrans.Transportation.IntegrationEvents;

/// <summary>
/// A container of a TransportRequest changed status and the request was re-aggregated. Carries the counts because a
/// request that is PARTIALLY_COMPLETED is not necessarily in trouble (one container delivered, the rest still moving):
/// whether anything failed is what a listener needs.
/// </summary>
public sealed record TransportRequestProgressed(
    Guid RequestId,
    string RequestCode,
    TransportRequestStatus Status,
    int TotalDetails,
    int CompletedDetails,
    int FailedDetails) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

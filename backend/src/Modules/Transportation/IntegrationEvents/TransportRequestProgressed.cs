using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Transportation.Enums;

namespace WaroTrans.Transportation.IntegrationEvents;

/// <summary>
/// A container of a TransportRequest changed status and the request was re-aggregated. Carries the counts because a
/// request that is PARTIALLY_COMPLETED is not necessarily in trouble (one container delivered, the rest still moving):
/// whether anything failed is what a listener needs. <see cref="ContainerId"/> / <see cref="DetailStatus"/> name the
/// Detail that moved, when one did (RTM-02).
/// </summary>
public sealed record TransportRequestProgressed(
    Guid RequestId,
    string RequestCode,
    TransportRequestStatus Status,
    int TotalDetails,
    int CompletedDetails,
    int FailedDetails,
    Guid? ContainerId = null,
    string? DetailStatus = null) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A person closed a TransportRequest: cancelled (TRN-01) or rejected (TRN-02). <see cref="Status"/> is CANCELLING
/// while containers on a robot still have to be recovered (<see cref="ContainersInRecovery"/>).
/// </summary>
public sealed record TransportRequestClosedByOperator(
    Guid RequestId,
    string RequestCode,
    TransportRequestStatus Status,
    Guid RequestedBy,
    Guid? ActorId,
    string Reason,
    int ContainersInRecovery) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

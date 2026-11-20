using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.WorkflowExecution.Features.HandoverStops;

public sealed record HandoverStopVersionRequest(Guid MoveId, int Version);

public sealed record HandoverStopContainerResponse(Guid ContainerId, string? Barcode);

public sealed record HandoverStopResponse(
    Guid Id,
    Guid JobId,
    string JobNo,
    Guid MapVersionId,
    Guid EndpointId,
    Guid MoveId,
    string Action,
    IReadOnlyList<HandoverStopContainerResponse> Containers,
    DateTimeOffset OfferOpensAt,
    DateTimeOffset? RobotReadyAt,
    Guid? ClaimedBy,
    string? ClaimedByName,
    DateTimeOffset? BeginDeadline,
    DateTimeOffset? BeganAt,
    int Version,
    IReadOnlyList<ActionAvailability> AvailableActions);

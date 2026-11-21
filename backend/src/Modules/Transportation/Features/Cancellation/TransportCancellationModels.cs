namespace WaroTrans.Transportation.Features.Cancellation;

/// <summary>Body of POST /transport-requests/{id}/cancel (TRN-01 / TRN-03). Everything but the reason is optional.</summary>
/// <param name="IdempotencyKey">Same key, same operation: a double click or a retry never cancels twice.</param>
/// <param name="DetailIds">Cancel only these details (they must not be picked up yet); empty = the whole request.</param>
public sealed record CancelTransportRequestBody(
    string? Reason,
    string? ReasonCode = null,
    string? IdempotencyKey = null,
    IReadOnlyList<Guid>? DetailIds = null);

/// <summary>Body of the hand-over endpoint: the container a person took off the robot, scanned, and where they put it.</summary>
public sealed record CancelHandoverBody(
    Guid ContainerId,
    string? ScannedBarcode,
    Guid StorageLocationId,
    short? LevelNo,
    string? Note);

/// <summary>GET /transport-requests/{id}/cancel-preview: what a cancel would do, computed now (the cancel checks again).</summary>
public sealed record CancelPreviewResponse(
    Guid TransportRequestId,
    string RequestCode,
    string RequestStatus,
    bool CanCancel,
    string? CannotCancelReason,
    int TotalContainers,
    int Delivered,
    int OnRobot,
    int NotPickedUp,
    int AlreadyClosed,
    IReadOnlyList<CancelPreviewJob> Jobs,
    IReadOnlyList<CancelPreviewDetail> Details,
    IReadOnlyList<string> ReasonCodes);

public sealed record CancelPreviewJob(
    Guid JobId,
    string JobNo,
    string JobStatus,
    Guid? RobotId,
    string? RobotCode,
    bool RobotOnline,
    int Delivered,
    int OnRobot,
    int NotPickedUp,
    int Total);

public sealed record CancelPreviewDetail(
    Guid DetailId,
    int SequenceNo,
    Guid ContainerId,
    string? ContainerBarcode,
    string DetailStatus,
    string? JobContainerStatus,
    string? JobNo,
    bool CanCancelAlone,
    string? CannotCancelAloneReason);

/// <summary>GET /transport-requests/{id}/cancellation: the latest cancellation of the request and where it stands.</summary>
public sealed record CancellationResponse(
    Guid Id,
    Guid TransportRequestId,
    string Scope,
    IReadOnlyList<Guid>? TargetDetailIds,
    string Status,
    string ReasonCode,
    string? Reason,
    Guid? RequestedBy,
    DateTimeOffset RequestedAt,
    DateTimeOffset? FinalizedAt,
    string? LastError,
    int Delivered,
    int HandedOver,
    int NotPickedUp,
    int OnRobot,
    int NeedsAttention,
    IReadOnlyList<CancellationItemResponse> Items);

public sealed record CancellationItemResponse(
    Guid JobId,
    string JobNo,
    string JobStatus,
    Guid? RobotId,
    string? RobotCode,
    bool RobotOnline,
    bool RobotMotionHeld,
    string Stage,
    bool CanHandOver,
    bool CanDeliver,
    IReadOnlyList<CancellationContainerResponse> Containers,
    string? Phase = null,
    string? InitialPhase = null,
    bool RobotLocalized = false,
    string? RecoveryPointCode = null,
    DateTimeOffset? HandoverRequestedAt = null,
    string? DestinationStatus = null,
    string? DestinationEndpointCode = null,
    string? DestinationNote = null,
    IReadOnlyList<string>? Actions = null,
    IReadOnlyDictionary<string, string>? BlockedActions = null);

/// <summary>Body of "send to recovery point": none = the nearest free one.</summary>
public sealed record SendToRecoveryBody(Guid? EndpointId);

/// <summary>Body of "request manual handover": what the person should know.</summary>
public sealed record ManualHandoverBody(string? Note);

public sealed record CancellationContainerResponse(
    Guid ContainerId,
    string? Barcode,
    string JobContainerStatus,
    string? Resolution,
    Guid? StorageLocationId,
    short? LevelNo,
    DateTimeOffset? HandedOverAt);

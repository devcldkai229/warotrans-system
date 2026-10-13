namespace WaroTrans.Transportation.Features.QueueTransportRequest;

/// <summary>
/// Staff-facing result. Job batch plans/stops stay internal; only Job summaries are returned.
/// </summary>
public sealed record QueueTransportRequestResponse(
    Guid TransportRequestId,
    string RequestCode,
    string Status,
    DateTimeOffset? QueuedAt,
    IReadOnlyList<QueuedJobResponse> Jobs);

public sealed record QueuedJobResponse(
    Guid JobId,
    string JobNo,
    string BatchKey,
    int JobContainerCount,
    int JobTaskCount,
    int JobStepCount);

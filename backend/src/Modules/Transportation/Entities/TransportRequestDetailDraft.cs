namespace WaroTrans.Transportation.Entities;

/// <summary>
/// One requested Container move, before ids and status are assigned by <see cref="TransportRequest.Submit"/>.
/// </summary>
public sealed record TransportRequestDetailDraft(
    int SequenceNo,
    Guid ContainerId,
    Guid? SourceStorageLocationId,
    Guid SourceEndpointId,
    short? SourceLevelNo,
    Guid? DestinationStorageLocationId,
    Guid DestinationEndpointId,
    short? DestinationLevelNo);

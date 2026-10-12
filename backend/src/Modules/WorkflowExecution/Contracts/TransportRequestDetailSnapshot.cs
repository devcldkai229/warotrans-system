namespace WaroTrans.WorkflowExecution.Contracts;

public sealed record TransportRequestDetailSnapshot(
    Guid DetailId,
    int SequenceNo,
    Guid ContainerId,
    Guid? SourceStorageLocationId,
    Guid SourceEndpointId,
    short? SourceLevelNo,
    Guid? DestinationStorageLocationId,
    Guid DestinationEndpointId,
    short? DestinationLevelNo);

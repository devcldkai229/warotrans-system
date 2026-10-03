using WaroTrans.Transportation.Enums;

namespace WaroTrans.Transportation.Entities;

public sealed class TransportRequestDetail
{
    public Guid Id { get; set; }
    public Guid TransportRequestId { get; set; }
    public int SequenceNo { get; set; }
    public Guid ContainerId { get; set; }
    public Guid? SourceStorageLocationId { get; set; }
    public Guid SourceEndpointId { get; set; }
    public short SourceLevelNo { get; set; }
    public Guid? DestinationStorageLocationId { get; set; }
    public Guid DestinationEndpointId { get; set; }
    public short DestinationLevelNo { get; set; }
    public TransportRequestDetailStatus Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public TransportRequest TransportRequest { get; set; } = null!;
}

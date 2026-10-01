namespace WaroTrans.Transportation.ValueObjects;

public class TransportDataDocument
{
    public int SchemaVersion { get; set; }
    public List<TransportMovementDocument> Movements { get; set; } = [];
}

public class TransportMovementDocument
{
    public int SequenceNo { get; set; }
    public Guid ContainerId { get; set; }
    public TransportLocationDocument Source { get; set; } = new();
    public TransportLocationDocument Destination { get; set; } = new();
}

public class TransportLocationDocument
{
    public Guid? StorageLocationId { get; set; }
    public Guid EndpointId { get; set; }
    public short LevelNo { get; set; }
}

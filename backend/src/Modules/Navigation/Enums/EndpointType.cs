namespace WaroTrans.Navigation.Enums;

public enum EndpointType
{
    WAYPOINT,
    CHARGER,
    PARK,

    /// <summary>Queue point: where a robot waits its turn for a busy goal or stands aside for another robot.</summary>
    QUEUE
}

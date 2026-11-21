using System.Text.Json.Serialization;

namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

public sealed record RobotHandoverStop(
    Guid Id, Guid MoveId, int Version,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<Guid>? ContainerIds = null)
{
    public const string Capability = "HANDOVER_STOP_CONFIRM_V1";
}

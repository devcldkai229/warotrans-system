using System.Text.Json.Serialization;

namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

public sealed record RobotRecoveryTransfer(
    Guid Id, int Version,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<Guid>? ContainerIds = null)
{
    public const string Capability = "RECOVERY_TRANSFER_CONFIRM_V1";
    public const string InteractionType = "RECOVERY_TRANSFER_CONFIRM";
}

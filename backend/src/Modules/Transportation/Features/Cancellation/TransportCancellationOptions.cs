namespace WaroTrans.Transportation.Features.Cancellation;

/// <summary>TRN-03 destination policy. Section "TransportCancellation".</summary>
public sealed class TransportCancellationOptions
{
    public const string SectionName = "TransportCancellation";

    /// <summary>
    /// When a cancelled Job is over (nothing left on its robot), the robot drives to a free parking place by itself
    /// (a wait point when it was on its way to a pickup). Off: robots stay where they are.
    /// </summary>
    public bool SendRobotsToParking { get; set; } = true;

    /// <summary>A robot that cannot be sent yet (still held, robot busy, every place taken) is tried again for this long.</summary>
    public int ParkingRetrySeconds { get; set; } = 90;

    /// <summary>
    /// Reasons after which the cargo may still be delivered ("continue delivery"), comma separated. A wrong request, a
    /// stock problem or a robot problem must not deliver it. At a drop-off the delivery can always be confirmed.
    /// </summary>
    public string ContinueDeliveryReasonCodes { get; set; } = "OPERATOR_REQUESTED,CUSTOMER_CANCELLED,OTHER";

    public bool AllowsDelivery(string reasonCode) =>
        (ContinueDeliveryReasonCodes ?? string.Empty)
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Contains(reasonCode, StringComparer.OrdinalIgnoreCase);
}

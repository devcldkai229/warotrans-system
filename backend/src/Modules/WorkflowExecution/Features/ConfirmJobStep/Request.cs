namespace WaroTrans.WorkflowExecution.Features.ConfirmJobStep;

/// <param name="ContainerId">Scanned container. Required for PICKUP_CONFIRM / DROPOFF_CONFIRM.</param>
/// <param name="ScannedBarcode">What was actually scanned, when there is a scan: the server compares it too.</param>
public sealed record ConfirmJobStepRequest(Guid? ContainerId, string? Note, string? ScannedBarcode = null);

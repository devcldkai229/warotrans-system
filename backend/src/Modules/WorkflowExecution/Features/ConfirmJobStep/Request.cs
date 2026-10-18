namespace WaroTrans.WorkflowExecution.Features.ConfirmJobStep;

/// <param name="ContainerId">Scanned container. Required for PICKUP_CONFIRM / DROPOFF_CONFIRM.</param>
public sealed record ConfirmJobStepRequest(Guid? ContainerId, string? Note);

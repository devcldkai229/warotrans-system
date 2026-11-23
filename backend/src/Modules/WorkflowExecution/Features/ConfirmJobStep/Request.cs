namespace WaroTrans.WorkflowExecution.Features.ConfirmJobStep;

/// <param name="ContainerId">Scanned container. Required for PICKUP_CONFIRM / DROPOFF_CONFIRM.</param>
/// <param name="ScannedBarcode">What was actually scanned, when there is a scan: the server compares it too.</param>
/// <param name="InspectionResult">PASSED or FAILED. Required for INSPECTION_CONFIRM (a FAILED result needs a note), refused elsewhere.</param>
/// <param name="Defects">A FAILED inspection: the problems found (container problem codes); none is OTHER. That container
/// leaves the Job at the inspection point and is held there.</param>
public sealed record ConfirmJobStepRequest(
    Guid? ContainerId, string? Note, string? ScannedBarcode = null, string? InspectionResult = null, IReadOnlyList<string>? Defects = null);

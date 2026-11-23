using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>
/// Confirmation channel for a HUMAN_INTERACTION step. Staff App carries a user id;
/// the physical robot button carries a robot id and MQTT message id (no Staff identity).
/// </summary>
public sealed record HumanConfirmationSource(
    ConfirmationSource Channel,
    Guid? UserId = null,
    Guid? RobotId = null,
    Guid? MessageId = null,
    string? Note = null,
    string? ScannedBarcode = null,
    string? InspectionResult = null,
    IReadOnlyList<string>? Defects = null)
{
    /// <param name="defects">A FAILED inspection: every problem found (container problem codes).</param>
    public static HumanConfirmationSource StaffApp(
        Guid userId, string? note = null, string? scannedBarcode = null, string? inspectionResult = null, IReadOnlyList<string>? defects = null) =>
        new(ConfirmationSource.STAFF_APP, UserId: userId, Note: note, ScannedBarcode: scannedBarcode, InspectionResult: inspectionResult,
            Defects: defects);

    public static HumanConfirmationSource RobotButton(Guid robotId, Guid messageId) =>
        new(ConfirmationSource.ROBOT_BUTTON, RobotId: robotId, MessageId: messageId);
}

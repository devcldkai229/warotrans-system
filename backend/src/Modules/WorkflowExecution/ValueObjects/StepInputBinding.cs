using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;

namespace WaroTrans.WorkflowExecution.ValueObjects;

/// <summary>
/// Binding for one Step input key. Stored in WorkflowStep.InputBindings JSONB.
/// </summary>
public sealed class StepInputBinding
{
    public BindingSourceType SourceType { get; set; }

    /// <summary>
    /// Variable key, CURRENT_MOVEMENT path, or StepKey (for STEP_OUTPUT).
    /// Unused for CONSTANT.
    /// </summary>
    public string? SourceReference { get; set; }

    /// <summary>Output key when SourceType = STEP_OUTPUT.</summary>
    public string? OutputKey { get; set; }

    /// <summary>Literal value when SourceType = CONSTANT.</summary>
    public JsonElement? ConstantValue { get; set; }
}

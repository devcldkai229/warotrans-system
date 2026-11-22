using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.ValueObjects;

public sealed class WorkflowVariableDefinition
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public WorkflowDataType DataType { get; set; }
    public WorkflowVariableSource Source { get; set; }
    public bool IsRequired { get; set; }
    public JsonElement? DefaultValue { get; set; }
    public JsonElement? ConfiguredValue { get; set; }
    public string? Description { get; set; }
    public int SequenceNo { get; set; }

    /// <summary>
    /// How a UUID variable is edited, nothing more: <see cref="WaypointFormat"/> = an Endpoint of the published map,
    /// picked from a list. The value stays the Endpoint's UUID for the workflow and the runtime.
    /// </summary>
    public string? Format { get; set; }

    public const string WaypointFormat = "WAYPOINT";

    /// <summary>A UUID of an EndpointGroup: a MOVE to it goes to a free member, picked when the step starts.</summary>
    public const string WaypointGroupFormat = "WAYPOINT_GROUP";
}

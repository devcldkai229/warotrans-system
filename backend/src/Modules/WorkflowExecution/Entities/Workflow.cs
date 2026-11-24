using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Entities;

public sealed class Workflow
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public int VersionNo { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public WorkflowStatus Status { get; set; }
    public List<WorkflowVariableDefinition> VariablesSchema { get; set; } = [];
    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }
    public Guid? PublishedBy { get; set; }

    /// <summary>
    /// Whether STAFF accounts see this workflow and its Jobs. A setting of the workflow code (every version carries the
    /// same value), changed by an administrator at any time; robot care workflows (charging, return to park) are not
    /// for the warehouse floor. ADMIN and TECHNICIAN always see every workflow.
    /// </summary>
    public bool StaffVisible { get; set; } = true;

    public ICollection<WorkflowTask> Tasks { get; set; } = [];
}

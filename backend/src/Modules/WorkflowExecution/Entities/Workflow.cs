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

    public ICollection<WorkflowTask> Tasks { get; set; } = [];
}

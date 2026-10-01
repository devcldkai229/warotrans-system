namespace WaroTrans.WorkflowExecution.Entities;

public sealed class WorkflowTask
{
    public Guid Id { get; set; }
    public Guid WorkflowId { get; set; }
    public string TaskKey { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SequenceNo { get; set; }

    public Workflow Workflow { get; set; } = null!;
    public ICollection<WorkflowStep> Steps { get; set; } = [];
}

namespace WaroTrans.WorkflowExecution.Validation;

public sealed record WorkflowDefinitionValidationError(string Path, string Message);

public sealed class WorkflowDefinitionValidationResult
{
    public bool IsValid => Errors.Count == 0;
    public List<WorkflowDefinitionValidationError> Errors { get; } = [];

    public void Add(string path, string message) =>
        Errors.Add(new WorkflowDefinitionValidationError(path, message));
}

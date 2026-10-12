using WaroTrans.BuildingBlocks.Exceptions;

namespace WaroTrans.WorkflowExecution.Validation;

public sealed record JobPlanValidationError(string Code, string Path, string Message);

/// <summary>
/// Structured validation failure for JobBatchPlan against an ExecutionSnapshot.
/// </summary>
public sealed class JobPlanValidationException : AppException
{
    public JobPlanValidationException(IReadOnlyList<JobPlanValidationError> errors)
        : base(
            errors.Count == 1
                ? errors[0].Message
                : $"JobBatchPlan validation failed with {errors.Count} error(s).",
            statusCode: 400,
            code: "job_plan_invalid")
    {
        Errors = errors;
    }

    public IReadOnlyList<JobPlanValidationError> Errors { get; }
}

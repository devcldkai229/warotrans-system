using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;

namespace WaroTrans.WorkflowExecution.Features.ResumeJob;

public sealed class ResumeJobHandler(JobExecutionEngine engine, JobQueries queries)
{
    public async Task<JobDetailDto> HandleAsync(Guid jobId, ResumeJobRequest request, CancellationToken cancellationToken)
    {
        await engine.ResumeAsync(jobId, request.RobotId, cancellationToken);
        return await queries.GetDetailAsync(jobId, cancellationToken);
    }
}

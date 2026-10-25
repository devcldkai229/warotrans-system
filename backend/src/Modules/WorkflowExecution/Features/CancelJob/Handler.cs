using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;

namespace WaroTrans.WorkflowExecution.Features.CancelJob;

public sealed class CancelJobHandler(JobExecutionEngine engine, JobQueries queries)
{
    public async Task<JobDetailDto> HandleAsync(Guid jobId, CancelJobRequest request, CancellationToken cancellationToken)
    {
        await engine.CancelJobAsync(jobId, request.Reason, cancellationToken);
        return await queries.GetDetailAsync(jobId, cancellationToken);
    }
}

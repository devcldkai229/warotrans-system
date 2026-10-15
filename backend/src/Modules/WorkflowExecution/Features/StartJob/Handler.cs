using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;

namespace WaroTrans.WorkflowExecution.Features.StartJob;

public sealed class StartJobHandler(JobExecutionEngine engine, JobQueries queries)
{
    public async Task<JobDetailDto> HandleAsync(Guid jobId, StartJobRequest request, CancellationToken cancellationToken)
    {
        await engine.StartAsync(jobId, request.RobotId, cancellationToken);
        return await queries.GetDetailAsync(jobId, cancellationToken);
    }
}

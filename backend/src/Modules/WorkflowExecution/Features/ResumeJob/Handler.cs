using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.WorkflowExecution.Features.ResumeJob;

public sealed class ResumeJobHandler(
    JobExecutionEngine engine, JobQueries queries, ICurrentUser user, StaffWarehouseScope warehouseScope)
{
    public async Task<JobDetailDto> HandleAsync(Guid jobId, ResumeJobRequest request, CancellationToken cancellationToken)
    {
        var actor = user.AccountId ?? throw new AppException("Sign in to resume a Job.", 401, "unauthenticated");
        await warehouseScope.EnsureJobAccessAsync(jobId, user, cancellationToken);
        await engine.ResumeAsync(jobId, request.RobotId, cancellationToken, actor, user.Role == AppRoles.Admin);
        return await queries.GetDetailAsync(jobId, cancellationToken);
    }
}

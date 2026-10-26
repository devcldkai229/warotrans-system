using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;
using Microsoft.EntityFrameworkCore;

namespace WaroTrans.WorkflowExecution.Features.ConfirmJobStep;

public sealed class ConfirmJobStepHandler(
    JobExecutionEngine engine,
    JobQueries queries,
    WorkflowExecutionDbContext db,
    ICurrentUser currentUser)
{
    public async Task<JobDetailDto> HandleAsync(Guid jobStepId, ConfirmJobStepRequest request, CancellationToken cancellationToken)
    {
        var userId = currentUser.AccountId
            ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");

        await engine.ConfirmHumanStepAsync(
            jobStepId,
            request.ContainerId,
            HumanConfirmationSource.StaffApp(userId, request.Note),
            cancellationToken);

        var jobId = await db.JobSteps.AsNoTracking()
            .Where(s => s.Id == jobStepId)
            .Select(s => s.JobTask.JobId)
            .FirstAsync(cancellationToken);
        return await queries.GetDetailAsync(jobId, cancellationToken);
    }
}

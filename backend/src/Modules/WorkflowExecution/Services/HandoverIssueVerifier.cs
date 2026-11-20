using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Runtime;

namespace WaroTrans.WorkflowExecution.Services;

public sealed class HandoverIssueVerifier(
    WorkflowExecutionDbContext db, StaffWarehouseScope scope, ICurrentUser user, IWarehouseModule warehouse) : IHandoverIssueVerifier
{
    public async Task<IAsyncDisposable?> LockSubjectAsync(
        Guid jobId, Guid containerId, Guid? jobStepId, CancellationToken cancellationToken)
    {
        await scope.EnsureJobAccessAsync(jobId, user, cancellationToken);
        var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        try
        {
            if (!await db.JobContainers.AnyAsync(item => item.JobId == jobId && item.ContainerId == containerId, cancellationToken))
                throw SubjectMismatch();

            if (jobStepId is { } stepId)
            {
                var context = await db.JobSteps.AsNoTracking()
                    .Where(step => step.Id == stepId && step.JobTask.JobId == jobId)
                    .Select(step => step.JobTask.ContextValues)
                    .SingleOrDefaultAsync(cancellationToken);
                if (context is null || CurrentMovementContextFactory.FromJobTaskContext(context).ContainerId != containerId)
                    throw SubjectMismatch();
            }

            return transaction;
        }
        catch
        {
            if (transaction is not null) await transaction.DisposeAsync();
            throw;
        }
    }

    public async Task<bool> BarcodeMatchesAsync(Guid containerId, string barcode, CancellationToken cancellationToken)
    {
        var container = (await warehouse.GetContainersAsync([containerId], cancellationToken)).SingleOrDefault();
        return container is not null && string.Equals(container.Barcode, barcode.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    private static DomainValidationException SubjectMismatch() =>
        new("The container or step does not belong to this Job handover.", "issue_handover_subject_mismatch");
}

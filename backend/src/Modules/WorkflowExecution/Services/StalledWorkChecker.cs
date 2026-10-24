using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>
/// One pass over the work that is waiting on a person: jobs nobody started and steps nobody confirmed. It only raises
/// events; whoever listens decides what to do (the Host turns them into admin notifications).
/// </summary>
public sealed class StalledWorkChecker(
    WorkflowExecutionDbContext db,
    IIntegrationEventPublisher events,
    IOptions<StalledWorkOptions> options,
    TimeProvider clock)
{
    /// <returns>How many events were raised.</returns>
    public async Task<int> CheckAsync(CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var settings = options.Value;
        var raised = 0;

        // Jobs are created CREATED and only start when somebody runs them on a robot, so the wait is counted from
        // creation (QueuedAt is set at the moment the job starts, it says nothing about waiting).
        var unstartedBefore = now.AddMinutes(-Math.Max(1, settings.UnstartedJobMinutes));
        var unstarted = await db.Jobs.AsNoTracking()
            .Where(j => (j.Status == JobStatus.CREATED || j.Status == JobStatus.QUEUED)
                        && (j.QueuedAt ?? j.CreatedAt) <= unstartedBefore)
            .Select(j => new { j.Id, j.JobNo, Since = j.QueuedAt ?? j.CreatedAt })
            .ToListAsync(cancellationToken);
        foreach (var job in unstarted)
        {
            await events.PublishAsync(new JobWaitingToStart(job.Id, job.JobNo, job.Since), cancellationToken);
            raised++;
        }

        var unconfirmedBefore = now.AddMinutes(-Math.Max(1, settings.HumanStepMinutes));
        var waiting = await (
                from step in db.JobSteps.AsNoTracking()
                join task in db.JobTasks.AsNoTracking() on step.JobTaskId equals task.Id
                join job in db.Jobs.AsNoTracking() on task.JobId equals job.Id
                join workflowStep in db.WorkflowSteps.AsNoTracking() on step.WorkflowStepId equals workflowStep.Id into names
                from workflowStep in names.DefaultIfEmpty()
                where step.StepType == StepType.HUMAN_INTERACTION
                      && step.Status == JobStepStatus.WAITING
                      && step.StartedAt != null
                      && step.StartedAt <= unconfirmedBefore
                      && job.Status == JobStatus.RUNNING
                select new
                {
                    JobId = job.Id,
                    job.JobNo,
                    StepId = step.Id,
                    StepName = workflowStep != null ? workflowStep.Name : null,
                    Since = step.StartedAt!.Value
                })
            .ToListAsync(cancellationToken);
        foreach (var step in waiting)
        {
            await events.PublishAsync(
                new JobStepWaitingForPerson(step.JobId, step.JobNo, step.StepId, step.StepName ?? "a step", step.Since),
                cancellationToken);
            raised++;
        }

        return raised;
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.IntegrationEventHandlers;

/// <summary>
/// When a robot comes back online, re-arm a WAITING PICKUP/DROPOFF step on its active Job
/// so a Pi restart does not leave the button permanently disarmed.
/// </summary>
public sealed class RobotConnectivityRearmHandler(
    WorkflowExecutionDbContext db,
    JobExecutionEngine engine,
    ILogger<RobotConnectivityRearmHandler> logger)
    : IIntegrationEventHandler<RobotConnectivityChanged>
{
    private static readonly JobStatus[] Active =
        [JobStatus.ASSIGNED, JobStatus.RUNNING, JobStatus.PAUSED, JobStatus.REASSIGNING, JobStatus.RECOVERY_REQUIRED];

    public async Task HandleAsync(RobotConnectivityChanged e, CancellationToken cancellationToken = default)
    {
        if (!e.IsOnline)
        {
            return;
        }

        var activeJobs = await db.Jobs
            .AsNoTracking()
            .Include(j => j.JobTasks).ThenInclude(t => t.JobSteps)
            .AsSplitQuery()
            .Where(j => Active.Contains(j.Status))
            .ToListAsync(cancellationToken);

        var job = activeJobs.FirstOrDefault(j =>
            j.ContextValues.TryGetValue(JobExecutionEngine.AssignedRobotKey, out var rid)
            && rid.ValueKind == System.Text.Json.JsonValueKind.String
            && rid.GetGuid() == e.RobotId);

        if (job is null || job.Status != JobStatus.RUNNING)
        {
            return;
        }

        JobStep? waiting = null;
        foreach (var task in job.JobTasks.OrderBy(t => t.SequenceNo))
        {
            foreach (var step in task.JobSteps.OrderBy(s => s.SequenceNo))
            {
                if (step.Status == JobStepStatus.COMPLETED)
                {
                    continue;
                }

                if (step.Status == JobStepStatus.WAITING && step.StepType == StepType.HUMAN_INTERACTION)
                {
                    waiting = step;
                }

                break;
            }

            if (waiting is not null)
            {
                break;
            }
        }

        if (waiting is null)
        {
            return;
        }

        var workflowStep = await db.WorkflowSteps.AsNoTracking()
            .SingleAsync(s => s.Id == waiting.WorkflowStepId, cancellationToken);

        // Load tracked job for arming helper (needs Job entity with ContextValues).
        var tracked = await db.Jobs
            .Include(j => j.JobContainers)
            .Include(j => j.JobTasks).ThenInclude(t => t.JobSteps)
            .AsSplitQuery()
            .FirstAsync(j => j.Id == job.Id, cancellationToken);
        var trackedStep = tracked.JobTasks.SelectMany(t => t.JobSteps).First(s => s.Id == waiting.Id);

        logger.LogInformation(
            "Re-arming HUMAN_INTERACTION on robot reconnect robot={RobotCode} job={JobNo} step={StepId}",
            e.RobotCode,
            tracked.JobNo,
            waiting.Id);

        await engine.TryArmHumanInteractionAsync(tracked, trackedStep, workflowStep, cancellationToken);
    }
}

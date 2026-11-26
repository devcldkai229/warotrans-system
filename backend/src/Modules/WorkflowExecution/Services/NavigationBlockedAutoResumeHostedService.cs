using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Enums;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Services;

public sealed class NavigationBlockedAutoResumeOptions
{
    public const string SectionName = "WorkflowExecution:NavigationBlockedAutoResume";

    public bool Enabled { get; set; } = true;

    /// <summary>Time a Job stays PAUSED on NAVIGATION_BLOCKED before it is resumed on its own.</summary>
    public int DelaySeconds { get; set; } = 15;

    /// <summary>Automatic resumes per failed MOVE step; after that the Job waits for an operator as before.</summary>
    public int MaxResumes { get; set; } = 3;
}

/// <summary>
/// A MOVE that made no progress for 60 s ends NAVIGATION_BLOCKED and the Job PAUSES for an operator. With two robots that
/// is mostly the other robot standing near the way for a while, not a fault (lab 2026-11-25 V024: S2 and S6 paused that
/// way, and both went on at once when resumed by hand). Such a Job is resumed on its own after <see
/// cref="NavigationBlockedAutoResumeOptions.DelaySeconds"/>, a few times per step, while its robot is online and localized.
/// </summary>
public sealed class NavigationBlockedAutoResumeHostedService(
    IServiceScopeFactory scopeFactory,
    IOptions<NavigationBlockedAutoResumeOptions> options,
    TimeProvider clock,
    ILogger<NavigationBlockedAutoResumeHostedService> logger) : BackgroundService
{
    private const string NavigationBlocked = "NAVIGATION_BLOCKED";
    private readonly ConcurrentDictionary<Guid, int> _resumesPerStep = new();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled)
        {
            return;
        }

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                try
                {
                    await ScanAsync(stoppingToken).ConfigureAwait(false);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogWarning(ex, "NAVIGATION_BLOCKED auto-resume scan failed");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    internal async Task ScanAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var now = clock.GetUtcNow();
        var due = now.AddSeconds(-Math.Max(0, options.Value.DelaySeconds));
        var paused = await db.JobSteps.AsNoTracking()
            .Where(s => s.StepType == StepType.MOVE && s.Status == JobStepStatus.FAILED && s.ErrorCode == NavigationBlocked
                        && s.JobTask.Job.Status == JobStatus.PAUSED && s.JobTask.Job.FailureCode == NavigationBlocked
                        && s.JobTask.Job.OperatorPausedBy == null
                        && s.CompletedAt != null && s.CompletedAt <= due)
            .Select(s => new { StepId = s.Id, JobId = s.JobTask.JobId, s.JobTask.Job.JobNo })
            .ToListAsync(cancellationToken);
        foreach (var p in paused)
        {
            var done = _resumesPerStep.GetValueOrDefault(p.StepId);
            if (done >= options.Value.MaxResumes)
            {
                continue;
            }

            var robotId = await db.JobRobotAssignments.AsNoTracking()
                .Where(a => a.JobId == p.JobId)
                .OrderByDescending(a => a.StartedAt)
                .Select(a => (Guid?)a.RobotId)
                .FirstOrDefaultAsync(cancellationToken);
            var fleet = scope.ServiceProvider.GetRequiredService<IFleetModule>();
            if (robotId is null || await fleet.GetRobotAsync(robotId.Value, cancellationToken) is not
                { IsOnline: true, LocalizationStatus: LocalizationStatus.LOCALIZED } robot)
            {
                continue;
            }

            _resumesPerStep[p.StepId] = done + 1;
            try
            {
                await scope.ServiceProvider.GetRequiredService<JobExecutionEngine>()
                    .ResumeAsync(p.JobId, robot.Id, cancellationToken, actor: null, isAdministrator: true);
                logger.LogWarning("Job {JobNo}: NAVIGATION_BLOCKED, resumed on its own on {Robot} ({Done}/{Max})",
                    p.JobNo, robot.Code, done + 1, options.Value.MaxResumes);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogInformation("Job {JobNo}: NAVIGATION_BLOCKED auto-resume refused: {Reason}", p.JobNo, ex.Message);
            }
        }
    }
}

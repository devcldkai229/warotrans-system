using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Operations.Contracts;
using WaroTrans.Operations.Enums;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.IntegrationEvents;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Host.Realtime;

/// <summary>
/// Turns the few business events an admin has to act on into notifications. The Host does this because it is the one
/// place that may know about Fleet, WorkflowExecution and Operations together. Anything that is merely progress
/// (a job completing, a step moving on, telemetry) is left to the live pages.
/// </summary>
public sealed class AdminNotificationProducer(
    INotificationService notifications,
    ILogger<AdminNotificationProducer> logger)
    : IIntegrationEventHandler<JobStatusChanged>,
        IIntegrationEventHandler<RobotConnectivityChanged>,
        IIntegrationEventHandler<RobotCommandLifecycleChanged>,
        IIntegrationEventHandler<RobotBatteryLow>,
        IIntegrationEventHandler<RobotErrorReported>,
        IIntegrationEventHandler<JobStepStatusChanged>,
        IIntegrationEventHandler<JobWaitingToStart>,
        IIntegrationEventHandler<JobStepWaitingForPerson>,
        IIntegrationEventHandler<TransportRequestProgressed>
{
    private const string Job = "JOB";
    private const string Robot = "ROBOT";
    private const string Request = "REQUEST";

    /// <summary>A job in one of these is waiting for an admin; moving on to anything else resolves the notification.</summary>
    private static readonly string[] NeedsAdminStatuses = ["PAUSED", "REASSIGNING", "RECOVERY_REQUIRED"];

    public Task HandleAsync(JobStatusChanged e, CancellationToken cancellationToken = default) =>
        SafelyAsync(async () =>
        {
            var reason = string.IsNullOrWhiteSpace(e.FailureCode) ? null : $" Reason: {e.FailureCode}.";
            NotificationDraft? draft = e.Status switch
            {
                "FAILED" => new(NotificationType.ALERT, "JOB_FAILED", $"Job {e.JobNo} failed",
                    $"The job stopped and will not continue.{reason}", Job, e.JobId, $"job:{e.JobId}:FAILED"),
                "PAUSED" => new(NotificationType.WARNING, "JOB_PAUSED", $"Job {e.JobNo} is paused",
                    $"A step failed and the workflow waits for an operator to resume it.{reason}", Job, e.JobId, $"job:{e.JobId}:PAUSED"),
                "REASSIGNING" => new(NotificationType.WARNING, "JOB_REASSIGNING", $"Job {e.JobNo} needs another robot",
                    $"The robot could not finish the job; assign it to a different robot.{reason}", Job, e.JobId, $"job:{e.JobId}:REASSIGNING"),
                "RECOVERY_REQUIRED" => new(NotificationType.ALERT, "JOB_RECOVERY_REQUIRED", $"Job {e.JobNo} needs recovery",
                    $"The job lost its robot and has to be recovered by an admin.{reason}", Job, e.JobId, $"job:{e.JobId}:RECOVERY_REQUIRED"),
                _ => null
            };

            if (draft is not null)
            {
                await notifications.PublishAsync(draft, cancellationToken);
            }

            // The job moved on (resumed, reassigned, finished): what was waiting for an admin no longer is.
            foreach (var waiting in NeedsAdminStatuses.Where(status => status != e.Status))
            {
                await notifications.ResolveAsync($"job:{e.JobId}:{waiting}", cancellationToken);
            }

            if (e.Status is not ("CREATED" or "QUEUED"))
            {
                await notifications.ResolveAsync($"job:{e.JobId}:unstarted", cancellationToken);
            }
        });

    public Task HandleAsync(RobotConnectivityChanged e, CancellationToken cancellationToken = default) =>
        SafelyAsync(async () =>
        {
            var key = $"robot:{e.RobotId}:offline";
            if (e.IsOnline)
            {
                await notifications.ResolveAsync(key, cancellationToken);
                return;
            }

            await notifications.PublishAsync(
                new NotificationDraft(
                    NotificationType.WARNING,
                    "ROBOT_OFFLINE",
                    $"Robot {e.RobotCode} went offline",
                    "No heartbeat from the robot. A job it was running may need to be reassigned.",
                    Robot,
                    e.RobotId,
                    key),
                cancellationToken);
        });

    public Task HandleAsync(RobotCommandLifecycleChanged e, CancellationToken cancellationToken = default) =>
        SafelyAsync(async () =>
        {
            // OFFLINE_ABORT is not reported: the robot going offline already has its own notification.
            NotificationDraft? draft = e.Phase switch
            {
                RobotCommandLifecycleChanged.Phases.AckTimeout => new(
                    NotificationType.WARNING, "ROBOT_COMMAND_TIMEOUT", $"Robot {e.RobotCode} did not answer a command",
                    $"The {e.Type} command timed out waiting for the robot to acknowledge it.",
                    Robot, e.RobotId, $"robot:{e.RobotId}:command:{e.Phase}"),
                RobotCommandLifecycleChanged.Phases.AckRejected => new(
                    NotificationType.WARNING, "ROBOT_COMMAND_REJECTED", $"Robot {e.RobotCode} rejected a command",
                    $"The {e.Type} command was refused{(string.IsNullOrWhiteSpace(e.ErrorCode) ? "" : $" ({e.ErrorCode})")}.",
                    Robot, e.RobotId, $"robot:{e.RobotId}:command:{e.Phase}"),
                _ => null
            };

            if (draft is not null)
            {
                await notifications.PublishAsync(draft, cancellationToken);
            }
        });

    public Task HandleAsync(RobotBatteryLow e, CancellationToken cancellationToken = default) =>
        SafelyAsync(() => notifications.PublishAsync(
            new NotificationDraft(
                NotificationType.WARNING,
                "ROBOT_BATTERY_LOW",
                $"Robot {e.RobotCode} battery is low",
                $"{e.BatteryPercent:0}% left and the robot is not charging.",
                Robot,
                e.RobotId,
                $"robot:{e.RobotId}:battery"),
            cancellationToken));

    public Task HandleAsync(RobotErrorReported e, CancellationToken cancellationToken = default) =>
        SafelyAsync(() => notifications.PublishAsync(
            new NotificationDraft(
                NotificationType.ALERT,
                "ROBOT_ERROR",
                $"Robot {e.RobotCode} reported an error",
                $"Error code: {e.ErrorCode}.",
                Robot,
                e.RobotId,
                $"robot:{e.RobotId}:error:{e.ErrorCode}"),
            cancellationToken));

    public Task HandleAsync(JobStepStatusChanged e, CancellationToken cancellationToken = default) =>
        SafelyAsync(async () =>
        {
            // The step was confirmed, failed or cancelled: nobody is being waited for any more.
            if (e.Status != "WAITING")
            {
                await notifications.ResolveAsync($"step:{e.JobStepId}:person", cancellationToken);
            }
        });

    public Task HandleAsync(JobWaitingToStart e, CancellationToken cancellationToken = default) =>
        SafelyAsync(() => notifications.PublishAsync(
            new NotificationDraft(
                NotificationType.WARNING,
                "JOB_NOT_STARTED",
                $"Job {e.JobNo} has not been started",
                $"It has been waiting {Waited(e.WaitingSince)} for a robot. Run it on a robot from its job page.",
                Job,
                e.JobId,
                $"job:{e.JobId}:unstarted",
                OncePerSituation: true),
            cancellationToken));

    public Task HandleAsync(JobStepWaitingForPerson e, CancellationToken cancellationToken = default) =>
        SafelyAsync(() => notifications.PublishAsync(
            new NotificationDraft(
                NotificationType.WARNING,
                "JOB_STEP_WAITING_FOR_PERSON",
                $"Job {e.JobNo} is waiting for a person",
                $"The step \"{e.StepName}\" needs someone to confirm it and has waited {Waited(e.WaitingSince)}.",
                Job,
                e.JobId,
                $"step:{e.JobStepId}:person",
                OncePerSituation: true),
            cancellationToken));

    public Task HandleAsync(TransportRequestProgressed e, CancellationToken cancellationToken = default) =>
        SafelyAsync(async () =>
        {
            switch (e.Status)
            {
                case TransportRequestStatus.FAILED:
                    // Every container failed: the earlier "some containers failed" is superseded by this one.
                    await notifications.ResolveAsync($"request:{e.RequestId}:partial", cancellationToken);
                    await notifications.PublishAsync(
                        new NotificationDraft(
                            NotificationType.ALERT,
                            "REQUEST_FAILED",
                            $"Transport request {e.RequestCode} failed",
                            $"None of its {e.TotalDetails} container(s) could be delivered.",
                            Request,
                            e.RequestId,
                            $"request:{e.RequestId}:failed",
                            OncePerSituation: true),
                        cancellationToken);
                    break;

                // PARTIALLY_COMPLETED also covers "one container delivered, the rest still moving"; only a failure is news.
                case TransportRequestStatus.PARTIALLY_COMPLETED when e.FailedDetails > 0:
                    await notifications.PublishAsync(
                        new NotificationDraft(
                            NotificationType.WARNING,
                            "REQUEST_PARTIALLY_FAILED",
                            $"Transport request {e.RequestCode} has failed containers",
                            $"{e.FailedDetails} of {e.TotalDetails} container(s) failed, {e.CompletedDetails} delivered.",
                            Request,
                            e.RequestId,
                            $"request:{e.RequestId}:partial",
                            OncePerSituation: true),
                        cancellationToken);
                    break;

                case TransportRequestStatus.COMPLETED:
                    await notifications.ResolveAsync($"request:{e.RequestId}:partial", cancellationToken);
                    break;
            }
        });

    /// <summary>"12 min", "3 h 05 min" or "8 days": how long something has waited, in the unit that reads naturally.</summary>
    internal static string Waited(DateTimeOffset since)
    {
        var waited = DateTimeOffset.UtcNow - since;
        var minutes = Math.Max(0, (int)waited.TotalMinutes);
        if (minutes < 60) return $"{minutes} min";
        if (minutes < 48 * 60) return $"{minutes / 60} h {minutes % 60:00} min";
        return $"{(int)waited.TotalDays} days";
    }

    // A notification is a side effect of the event: if it cannot be stored (the database is down) the job or robot
    // update that raised the event must still go through, so a failure is logged and swallowed.
    private async Task SafelyAsync(Func<Task> work)
    {
        try
        {
            await work();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Could not create an admin notification");
        }
    }
}

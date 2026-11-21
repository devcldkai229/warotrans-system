using WaroTrans.Transportation.Entities;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Services;

/// <summary>
/// TRN-03: decides, from what the Jobs and robots report now, where a cancellation stands. Pure, so every rule is
/// unit tested: a robot is only "stopped" when it reports a motion hold, an offline robot is never assumed stopped,
/// and a container taken off a robot only counts once it is delivered, handed over by scan or recovered to a shelf.
/// </summary>
public static class CancellationProgress
{
    /// <summary>Job failure code set when a request is cancelled with cargo on its robot (WorkflowExecution).</summary>
    public const string CargoOnboardCancelCode = "request_cancelled_cargo_onboard";

    /// <summary>JobContainer failure code of a container unloaded by hand after the cancel (WorkflowExecution).</summary>
    public const string CancelHandedOverCode = "cancel_handed_over";

    /// <summary>A stop not confirmed within this time is shown as waiting for the robot, not as stopping.</summary>
    public static readonly TimeSpan DefaultStopTimeout = TimeSpan.FromSeconds(60);

    /// <param name="containersInTransit">Containers Warehouse still has IN_TRANSIT (carried, no shelf).</param>
    public static string EvaluateItem(
        TransportCancellationItem item,
        RequestJobCancellationView job,
        IReadOnlySet<Guid> targetContainers,
        IReadOnlySet<Guid> containersInTransit,
        DateTimeOffset requestedAt,
        DateTimeOffset now,
        TimeSpan? stopTimeout = null)
    {
        var previous = item.Containers.ToDictionary(c => c.ContainerId);
        var containers = new List<CancellationContainer>();
        foreach (var jc in job.Containers.Where(c => targetContainers.Contains(c.ContainerId)))
        {
            var row = previous.GetValueOrDefault(jc.ContainerId) ?? new CancellationContainer { ContainerId = jc.ContainerId };
            var next = Clone(row);
            next.JobContainerStatus = jc.Status;
            next.Resolution = Resolve(jc, row, containersInTransit);
            containers.Add(next);
        }

        item.Containers = containers;
        item.RobotId = job.RobotId ?? item.RobotId;
        item.RobotCode = job.RobotCode ?? item.RobotCode;
        item.InitialPhase ??= job.Phase;
        item.Phase = job.Phase;
        if (job.RecoveryEndpointCode is { } recovery)
        {
            item.RecoveryPointCode = recovery;
        }

        var stage = Stage(job, containers, item.HandoverRequestedAt is not null, requestedAt, now, stopTimeout ?? DefaultStopTimeout);
        item.Stage = stage;
        return stage;
    }

    public static string Resolve(RequestJobContainerView jc, CancellationContainer row, IReadOnlySet<Guid> containersInTransit) =>
        jc.Status switch
        {
            "DELIVERED" => ContainerResolutions.Delivered,
            "FAILED" => ContainerResolutions.Failed,
            "CANCELLED" when jc.FailureCode == CancelHandedOverCode || row.HandedOverAt is not null => ContainerResolutions.HandedOver,
            "CANCELLED" when jc.LoadedAt is null => ContainerResolutions.NotPickedUp,
            "CANCELLED" => containersInTransit.Contains(jc.ContainerId) ? ContainerResolutions.Unrecovered : ContainerResolutions.RecoveredManually,
            _ => null
        };

    private static string Stage(
        RequestJobCancellationView job,
        IReadOnlyList<CancellationContainer> containers,
        bool handoverRequested,
        DateTimeOffset requestedAt,
        DateTimeOffset now,
        TimeSpan stopTimeout)
    {
        if (containers.Any(c => c.Resolution == ContainerResolutions.Unrecovered))
        {
            return CancellationStages.Manual;
        }

        if (containers.All(c => c.Resolution is not null))
        {
            return CancellationStages.Done;
        }

        var onboard = containers.Any(c => c.JobContainerStatus == "ONBOARD");
        if (!onboard)
        {
            // Not picked up and the Job not cancelled yet: the fan-out is still on its way (or is retried).
            return CancellationStages.Pending;
        }

        if (job.Status == "RUNNING")
        {
            return job.Phase == CancelRobotPhases.ToRecovery ? CancellationStages.ToRecovery : CancellationStages.Delivering;
        }

        if (job.Status is "RECOVERY_REQUIRED" or "FAILED" || (job.Terminal && onboard))
        {
            return CancellationStages.Manual;
        }

        if (!job.RobotOnline)
        {
            return job.RobotId is null ? CancellationStages.CargoOnRobot : CancellationStages.WaitingRobot;
        }

        if (job.RobotMotionHeld)
        {
            // Destination policy: where it holds decides what comes next.
            if (job.Phase == CancelRobotPhases.AtRecovery)
            {
                return CancellationStages.AtRecovery;
            }

            if (!job.RobotLocalized)
            {
                return CancellationStages.SafeStop; // cannot drive safely: a technician, cargo by hand only
            }

            if (handoverRequested)
            {
                return CancellationStages.HandoverRequested;
            }

            return job.Phase == CancelRobotPhases.AtDropoff ? CancellationStages.AtDropoff : CancellationStages.CargoOnRobot;
        }

        return now - requestedAt > stopTimeout ? CancellationStages.WaitingRobot : CancellationStages.StopRequested;
    }

    /// <summary>The cancellation as a whole: the item that needs the most attention decides.</summary>
    public static string Overall(IEnumerable<string> stages)
    {
        var all = stages.ToList();
        if (all.Contains(CancellationStages.Manual) || all.Contains(CancellationStages.SafeStop)) return CancellationStatuses.ManualIntervention;
        if (all.Contains(CancellationStages.WaitingRobot)) return CancellationStatuses.WaitingRobot;
        if (all.Contains(CancellationStages.StopRequested) || all.Contains(CancellationStages.Pending)) return CancellationStatuses.Stopping;
        if (all.Any(s => s != CancellationStages.Done)) return CancellationStatuses.Recovering;
        return CancellationStatuses.Finalized;
    }

    private static CancellationContainer Clone(CancellationContainer c) => new()
    {
        ContainerId = c.ContainerId,
        JobContainerStatus = c.JobContainerStatus,
        Resolution = c.Resolution,
        StorageLocationId = c.StorageLocationId,
        LevelNo = c.LevelNo,
        ScannedBarcode = c.ScannedBarcode,
        HandedOverBy = c.HandedOverBy,
        HandedOverAt = c.HandedOverAt
    };
}

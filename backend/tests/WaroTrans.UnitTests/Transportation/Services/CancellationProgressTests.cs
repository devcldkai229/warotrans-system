using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Services;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.UnitTests.Transportation.Services;

/// <summary>TRN-03: where a cancellation stands is decided from what Jobs and robots report, never from what was sent.</summary>
public sealed class CancellationProgressTests
{
    private static readonly Guid Request = Guid.NewGuid();
    private static readonly Guid C1 = Guid.NewGuid(), C2 = Guid.NewGuid(), C3 = Guid.NewGuid();
    private static readonly DateTimeOffset RequestedAt = new(2026, 11, 21, 8, 0, 0, TimeSpan.Zero);

    private static RequestJobContainerView Container(Guid id, string status, string? failure = null, bool loaded = false) =>
        new(id, Request, status, failure, loaded ? RequestedAt.AddMinutes(-5) : null, status == "DELIVERED" ? RequestedAt : null);

    private static RequestJobCancellationView Job(
        string status, bool online, bool held, string? failure = null, params RequestJobContainerView[] containers) =>
        new(Guid.NewGuid(), "J211126001", status, failure, Guid.NewGuid(), "RBT-002", online, held, containers,
            CancelRobotPhases.InTransit, RobotLocalized: true, RobotTelemetryFresh: true);

    private static string Evaluate(
        RequestJobCancellationView job,
        out TransportCancellationItem item,
        ISet<Guid>? inTransit = null,
        TimeSpan? after = null)
    {
        item = new TransportCancellationItem { JobId = job.JobId, JobNo = job.JobNo };
        return CancellationProgress.EvaluateItem(
            item,
            job,
            job.Containers.Select(c => c.ContainerId).ToHashSet(),
            (inTransit ?? new HashSet<Guid>()).ToHashSet(),
            RequestedAt,
            RequestedAt + (after ?? TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public void Where_a_held_robot_stands_decides_its_stage()
    {
        var onboard = Container(C1, "ONBOARD", loaded: true);
        var held = Job("PAUSED", true, true, CancellationProgress.CargoOnboardCancelCode, onboard);

        Assert.Equal(CancellationStages.AtRecovery, Evaluate(held with { Phase = CancelRobotPhases.AtRecovery, RecoveryEndpointCode = "EP-WAIT-1" }, out var item));
        Assert.Equal("EP-WAIT-1", item.RecoveryPointCode);
        Assert.Equal(CancellationStages.AtDropoff, Evaluate(held with { Phase = CancelRobotPhases.AtDropoff }, out _));
        Assert.Equal(CancellationStages.ToRecovery, Evaluate(held with { Status = "RUNNING", RobotMotionHeld = false, Phase = CancelRobotPhases.ToRecovery }, out _));
        // Lost localization: it holds still and is not asked to drive anywhere (a technician looks at it).
        Assert.Equal(CancellationStages.SafeStop, Evaluate(held with { RobotLocalized = false }, out _));
        Assert.Equal(CancellationStatuses.ManualIntervention, CancellationProgress.Overall([CancellationStages.SafeStop, CancellationStages.Done]));
        Assert.Equal(CancellationStatuses.Recovering, CancellationProgress.Overall([CancellationStages.AtRecovery, CancellationStages.Done]));
    }

    [Fact]
    public void A_handover_asked_for_is_shown_until_the_cargo_is_off_and_the_first_phase_is_kept()
    {
        var job = Job("PAUSED", true, true, CancellationProgress.CargoOnboardCancelCode, Container(C1, "ONBOARD", loaded: true));
        var item = new TransportCancellationItem { JobId = job.JobId, JobNo = job.JobNo, HandoverRequestedAt = RequestedAt, InitialPhase = CancelRobotPhases.ToPickup };

        var stage = CancellationProgress.EvaluateItem(item, job, new HashSet<Guid> { C1 }, new HashSet<Guid>(), RequestedAt, RequestedAt.AddSeconds(5));

        Assert.Equal(CancellationStages.HandoverRequested, stage);
        Assert.Equal(CancellationStages.HandoverRequested, item.Stage);
        Assert.Equal(CancelRobotPhases.ToPickup, item.InitialPhase);
        Assert.Equal(CancelRobotPhases.InTransit, item.Phase);
    }

    [Fact]
    public void A_job_cancelled_before_pickup_is_done_and_its_containers_were_never_picked_up()
    {
        var stage = Evaluate(Job("CANCELLED", true, false, "job_cancelled", Container(C1, "CANCELLED"), Container(C2, "CANCELLED")), out var item);

        Assert.Equal(CancellationStages.Done, stage);
        Assert.All(item.Containers, c => Assert.Equal(ContainerResolutions.NotPickedUp, c.Resolution));
    }

    [Fact]
    public void Delivered_containers_stay_delivered_and_count_as_resolved()
    {
        var stage = Evaluate(Job("COMPLETED", true, false, null,
            Container(C1, "DELIVERED", loaded: true), Container(C2, "DELIVERED", loaded: true), Container(C3, "DELIVERED", loaded: true)), out var item);

        Assert.Equal(CancellationStages.Done, stage);
        Assert.All(item.Containers, c => Assert.Equal(ContainerResolutions.Delivered, c.Resolution));
    }

    [Fact]
    public void A_robot_that_does_not_report_a_hold_is_still_stopping_and_after_the_timeout_waits_for_the_robot()
    {
        var job = Job("PAUSED", true, false, CancellationProgress.CargoOnboardCancelCode, Container(C1, "ONBOARD", loaded: true));

        Assert.Equal(CancellationStages.StopRequested, Evaluate(job, out _));
        Assert.Equal(CancellationStages.WaitingRobot, Evaluate(job, out _, after: TimeSpan.FromMinutes(2)));
    }

    [Fact]
    public void An_offline_robot_is_never_treated_as_stopped()
    {
        var job = Job("PAUSED", false, false, CancellationProgress.CargoOnboardCancelCode, Container(C1, "ONBOARD", loaded: true));

        Assert.Equal(CancellationStages.WaitingRobot, Evaluate(job, out _));
    }

    [Fact]
    public void A_robot_holding_still_with_cargo_waits_for_delivery_or_an_unload_by_scan()
    {
        var held = Job("PAUSED", true, true, CancellationProgress.CargoOnboardCancelCode, Container(C1, "ONBOARD", loaded: true));
        var resumed = Job("RUNNING", true, false, null, Container(C1, "ONBOARD", loaded: true));

        Assert.Equal(CancellationStages.CargoOnRobot, Evaluate(held, out _));
        Assert.Equal(CancellationStages.Delivering, Evaluate(resumed, out _));
    }

    [Fact]
    public void Cargo_unloaded_by_scan_is_handed_over()
    {
        var stage = Evaluate(Job("CANCELLED", true, true, "job_cancelled",
            Container(C1, "CANCELLED", CancellationProgress.CancelHandedOverCode, loaded: true)), out var item);

        Assert.Equal(CancellationStages.Done, stage);
        Assert.Equal(ContainerResolutions.HandedOver, Assert.Single(item.Containers).Resolution);
    }

    [Fact]
    public void Cargo_cancelled_without_a_handover_and_still_in_transit_needs_a_person_until_it_is_recovered()
    {
        var job = Job("CANCELLED", true, true, "job_cancelled", Container(C1, "CANCELLED", "job_cancelled", loaded: true));

        Assert.Equal(CancellationStages.Manual, Evaluate(job, out var lost, inTransit: new HashSet<Guid> { C1 }));
        Assert.Equal(ContainerResolutions.Unrecovered, Assert.Single(lost.Containers).Resolution);

        // Someone recovered it to a shelf (Warehouse no longer has it in transit).
        Assert.Equal(CancellationStages.Done, Evaluate(job, out var found));
        Assert.Equal(ContainerResolutions.RecoveredManually, Assert.Single(found.Containers).Resolution);
    }

    [Fact]
    public void A_job_in_payload_recovery_with_cargo_needs_a_person()
    {
        var job = Job("RECOVERY_REQUIRED", false, false, "robot_offline", Container(C1, "ONBOARD", loaded: true));

        Assert.Equal(CancellationStages.Manual, Evaluate(job, out _));
    }

    [Theory]
    [InlineData(new[] { CancellationStages.Done, CancellationStages.Done }, CancellationStatuses.Finalized)]
    [InlineData(new[] { CancellationStages.Done, CancellationStages.CargoOnRobot }, CancellationStatuses.Recovering)]
    [InlineData(new[] { CancellationStages.Delivering, CancellationStages.StopRequested }, CancellationStatuses.Stopping)]
    [InlineData(new[] { CancellationStages.CargoOnRobot, CancellationStages.WaitingRobot }, CancellationStatuses.WaitingRobot)]
    [InlineData(new[] { CancellationStages.WaitingRobot, CancellationStages.Manual }, CancellationStatuses.ManualIntervention)]
    [InlineData(new string[0], CancellationStatuses.Finalized)]
    public void The_item_that_needs_most_attention_decides_the_overall_status(string[] stages, string expected) =>
        Assert.Equal(expected, CancellationProgress.Overall(stages));

    [Fact]
    public void A_handover_already_recorded_is_kept_when_the_job_is_looked_at_again()
    {
        var job = Job("PAUSED", true, true, CancellationProgress.CargoOnboardCancelCode,
            Container(C1, "CANCELLED", CancellationProgress.CancelHandedOverCode, loaded: true), Container(C2, "ONBOARD", loaded: true));
        var item = new TransportCancellationItem
        {
            JobId = job.JobId,
            JobNo = job.JobNo,
            Containers = [new CancellationContainer { ContainerId = C1, StorageLocationId = Guid.NewGuid(), LevelNo = 2, HandedOverAt = RequestedAt }]
        };

        var stage = CancellationProgress.EvaluateItem(item, job, new HashSet<Guid> { C1, C2 }, new HashSet<Guid>(), RequestedAt, RequestedAt);

        Assert.Equal(CancellationStages.CargoOnRobot, stage);
        var c1 = item.Containers.Single(c => c.ContainerId == C1);
        Assert.Equal(ContainerResolutions.HandedOver, c1.Resolution);
        Assert.Equal((short)2, c1.LevelNo);
    }
}

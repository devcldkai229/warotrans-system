using System.Text.Json;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Validation;

namespace WaroTrans.UnitTests.WorkflowExecution.Validation;

public class JobBatchPlanValidatorTests
{
    [Fact]
    public void Valid_shared_pickup_plan_has_no_errors()
    {
        var (snapshot, batch) = BuildValidMultiDestination();
        Assert.Empty(JobBatchPlanValidator.Validate(snapshot, [batch]));
    }

    [Fact]
    public void Unknown_container_is_rejected()
    {
        var (snapshot, _) = BuildValidMultiDestination();
        var bad = new JobBatchPlan(
            "B1",
            1,
            [Guid.NewGuid()],
            [new JobStopPlan(1, Guid.NewGuid(), JobStopAction.PICKUP, [Guid.NewGuid()])]);

        Assert.Contains(JobBatchPlanValidator.Validate(snapshot, [bad]), e => e.Code == "batch_invalid_container");
    }

    [Fact]
    public void Duplicate_container_detail_is_rejected()
    {
        var a = Guid.NewGuid();
        var d = Guid.NewGuid();
        var c1 = Guid.NewGuid();
        var snapshot = Snapshot(
            Detail(1, c1, a, d),
            Detail(2, c1, a, d));
        var batch = new JobBatchPlan("B1", 1, [c1], [
            new JobStopPlan(1, a, JobStopAction.PICKUP, [c1]),
            new JobStopPlan(2, d, JobStopAction.DROPOFF, [c1])
        ]);

        Assert.Contains(JobBatchPlanValidator.Validate(snapshot, [batch]), e => e.Code == "duplicate_container_in_request");
    }

    [Fact]
    public void Endpoint_mismatch_is_rejected()
    {
        var (snapshot, _) = BuildValidSingle();
        var detail = snapshot.Details[0];
        var batch = new JobBatchPlan("B1", 1, [detail.ContainerId], [
            new JobStopPlan(1, Guid.NewGuid(), JobStopAction.PICKUP, [detail.ContainerId]),
            new JobStopPlan(2, detail.DestinationEndpointId, JobStopAction.DROPOFF, [detail.ContainerId])
        ]);

        Assert.Contains(JobBatchPlanValidator.Validate(snapshot, [batch]), e => e.Code == "pickup_endpoint_mismatch");
    }

    [Fact]
    public void Dropoff_before_pickup_is_rejected()
    {
        var (snapshot, _) = BuildValidSingle();
        var detail = snapshot.Details[0];
        var batch = new JobBatchPlan("B1", 1, [detail.ContainerId], [
            new JobStopPlan(1, detail.DestinationEndpointId, JobStopAction.DROPOFF, [detail.ContainerId]),
            new JobStopPlan(2, detail.SourceEndpointId, JobStopAction.PICKUP, [detail.ContainerId])
        ]);

        Assert.Contains(JobBatchPlanValidator.Validate(snapshot, [batch]), e => e.Code == "dropoff_before_pickup");
    }

    [Fact]
    public void Missing_pickup_is_rejected()
    {
        var (snapshot, _) = BuildValidSingle();
        var detail = snapshot.Details[0];
        var batch = new JobBatchPlan("B1", 1, [detail.ContainerId], [
            new JobStopPlan(1, detail.DestinationEndpointId, JobStopAction.DROPOFF, [detail.ContainerId])
        ]);

        Assert.Contains(JobBatchPlanValidator.Validate(snapshot, [batch]), e => e.Code == "missing_pickup");
    }

    [Fact]
    public void Missing_dropoff_is_rejected()
    {
        var (snapshot, _) = BuildValidSingle();
        var detail = snapshot.Details[0];
        var batch = new JobBatchPlan("B1", 1, [detail.ContainerId], [
            new JobStopPlan(1, detail.SourceEndpointId, JobStopAction.PICKUP, [detail.ContainerId])
        ]);

        Assert.Contains(JobBatchPlanValidator.Validate(snapshot, [batch]), e => e.Code == "missing_dropoff");
    }

    [Fact]
    public void Duplicate_pickup_is_rejected()
    {
        var (snapshot, _) = BuildValidSingle();
        var detail = snapshot.Details[0];
        var batch = new JobBatchPlan("B1", 1, [detail.ContainerId], [
            new JobStopPlan(1, detail.SourceEndpointId, JobStopAction.PICKUP, [detail.ContainerId]),
            new JobStopPlan(2, detail.SourceEndpointId, JobStopAction.PICKUP, [detail.ContainerId]),
            new JobStopPlan(3, detail.DestinationEndpointId, JobStopAction.DROPOFF, [detail.ContainerId])
        ]);

        Assert.Contains(JobBatchPlanValidator.Validate(snapshot, [batch]), e => e.Code == "duplicate_pickup");
    }

    [Fact]
    public void Duplicate_dropoff_is_rejected()
    {
        var (snapshot, _) = BuildValidSingle();
        var detail = snapshot.Details[0];
        var batch = new JobBatchPlan("B1", 1, [detail.ContainerId], [
            new JobStopPlan(1, detail.SourceEndpointId, JobStopAction.PICKUP, [detail.ContainerId]),
            new JobStopPlan(2, detail.DestinationEndpointId, JobStopAction.DROPOFF, [detail.ContainerId]),
            new JobStopPlan(3, detail.DestinationEndpointId, JobStopAction.DROPOFF, [detail.ContainerId])
        ]);

        Assert.Contains(JobBatchPlanValidator.Validate(snapshot, [batch]), e => e.Code == "duplicate_dropoff");
    }

    [Fact]
    public void Duplicate_batch_key_is_rejected()
    {
        var (snapshot, batch) = BuildValidSingle();
        var duplicate = batch with { SequenceNo = 2 };
        Assert.Contains(
            JobBatchPlanValidator.Validate(snapshot, [batch, duplicate]),
            e => e.Code == "duplicate_batch_key");
    }

    [Fact]
    public void ValidateOrThrow_raises_JobPlanValidationException()
    {
        var (snapshot, _) = BuildValidSingle();
        var bad = new JobBatchPlan("BAD", 1, [Guid.NewGuid()], [
            new JobStopPlan(1, Guid.NewGuid(), JobStopAction.PICKUP, [Guid.NewGuid()])
        ]);

        var ex = Assert.Throws<JobPlanValidationException>(() =>
            JobBatchPlanValidator.ValidateOrThrow(snapshot, [bad]));
        Assert.Equal("job_plan_invalid", ex.Code);
        Assert.NotEmpty(ex.Errors);
    }

    private static (TransportRequestExecutionSnapshot Snapshot, JobBatchPlan Batch) BuildValidSingle()
    {
        var a = Guid.NewGuid();
        var d = Guid.NewGuid();
        var c1 = Guid.NewGuid();
        var snapshot = Snapshot(Detail(1, c1, a, d));
        var batch = new JobBatchPlan("B1", 1, [c1], [
            new JobStopPlan(1, a, JobStopAction.PICKUP, [c1]),
            new JobStopPlan(2, d, JobStopAction.DROPOFF, [c1])
        ]);
        return (snapshot, batch);
    }

    private static (TransportRequestExecutionSnapshot Snapshot, JobBatchPlan Batch) BuildValidMultiDestination()
    {
        var a = Guid.NewGuid();
        var d = Guid.NewGuid();
        var e = Guid.NewGuid();
        var f = Guid.NewGuid();
        var c1 = Guid.NewGuid();
        var c2 = Guid.NewGuid();
        var c3 = Guid.NewGuid();
        var snapshot = Snapshot(Detail(1, c1, a, d), Detail(2, c2, a, e), Detail(3, c3, a, f));
        var batch = new JobBatchPlan("MULTI", 1, [c1, c2, c3], [
            new JobStopPlan(1, a, JobStopAction.PICKUP, [c1, c2, c3]),
            new JobStopPlan(2, d, JobStopAction.DROPOFF, [c1]),
            new JobStopPlan(3, e, JobStopAction.DROPOFF, [c2]),
            new JobStopPlan(4, f, JobStopAction.DROPOFF, [c3])
        ]);
        return (snapshot, batch);
    }

    private static TransportRequestExecutionSnapshot Snapshot(params TransportRequestDetailSnapshot[] details) =>
        new(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            1,
            new Dictionary<string, JsonElement>(),
            details);

    private static TransportRequestDetailSnapshot Detail(int seq, Guid containerId, Guid source, Guid dest) =>
        new(
            Guid.NewGuid(),
            seq,
            containerId,
            Guid.NewGuid(),
            source,
            1,
            Guid.NewGuid(),
            dest,
            2);
}

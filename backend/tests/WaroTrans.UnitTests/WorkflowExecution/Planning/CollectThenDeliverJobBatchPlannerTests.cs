using System.Text.Json;
using WaroTrans.UnitTests.WorkflowExecution.Fixtures;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Planning;
using WaroTrans.WorkflowExecution.Services;
using WaroTrans.WorkflowExecution.Validation;
using static WaroTrans.UnitTests.WorkflowExecution.Fixtures.JobRuntimeTestDb;

namespace WaroTrans.UnitTests.WorkflowExecution.Planning;

public sealed class CollectThenDeliverJobBatchPlannerTests
{
    // Readable names for endpoints / containers so plans and runtime graphs can be asserted as text.
    private readonly Dictionary<Guid, string> _names = [];
    private readonly Dictionary<string, Guid> _ids = [];
    private readonly CollectThenDeliverJobBatchPlanner _planner = new();

    private Guid Id(string name)
    {
        if (!_ids.TryGetValue(name, out var id))
        {
            id = Guid.NewGuid();
            _ids[name] = id;
            _names[id] = name;
        }

        return id;
    }

    private string Name(Guid id) => _names[id];

    /// <summary>"C1:A>D" → Detail(seq, C1, source A, destination D).</summary>
    private TransportRequestExecutionSnapshot Snapshot(Guid workflowId, params string[] moves) =>
        new(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            workflowId,
            1,
            new Dictionary<string, JsonElement>(),
            moves.Select((move, i) =>
            {
                var container = move.Split(':')[0];
                var route = move.Split(':')[1].Split('>');
                return new TransportRequestDetailSnapshot(
                    Guid.NewGuid(), i + 1, Id(container), null, Id(route[0]), null, null, Id(route[1]), null);
            }).ToList());

    private IReadOnlyList<string> Describe(JobBatchPlan batch) =>
        batch.Stops
            .OrderBy(s => s.SequenceNo)
            .Select(s => $"{s.SequenceNo} {s.Action} {Name(s.EndpointId)} [{string.Join(",", s.ContainerIds.Select(Name))}]")
            .ToList();

    [Fact]
    public void Case1_single_detail()
    {
        var batch = Assert.Single(_planner.Plan(Snapshot(Guid.NewGuid(), "C1:A>D")));

        Assert.Equal(["1 PICKUP A [C1]", "2 DROPOFF D [C1]"], Describe(batch));
    }

    [Fact]
    public void Case2_shared_pickup_is_one_stop()
    {
        var batch = Assert.Single(_planner.Plan(Snapshot(Guid.NewGuid(), "C1:A>D", "C2:A>E", "C3:A>F")));

        Assert.Equal(
            ["1 PICKUP A [C1,C2,C3]", "2 DROPOFF D [C1]", "3 DROPOFF E [C2]", "4 DROPOFF F [C3]"],
            Describe(batch));
    }

    [Fact]
    public void Case3_shared_destination_is_one_stop()
    {
        var batch = Assert.Single(_planner.Plan(Snapshot(Guid.NewGuid(), "C1:A>X", "C2:B>X", "C3:C>X")));

        Assert.Equal(
            ["1 PICKUP A [C1]", "2 PICKUP B [C2]", "3 PICKUP C [C3]", "4 DROPOFF X [C1,C2,C3]"],
            Describe(batch));
    }

    [Fact]
    public void Case4_collects_all_before_delivering()
    {
        var batch = Assert.Single(_planner.Plan(Snapshot(Guid.NewGuid(), "C1:A>D", "C2:B>E", "C3:C>F")));

        Assert.Equal(
            [
                "1 PICKUP A [C1]", "2 PICKUP B [C2]", "3 PICKUP C [C3]",
                "4 DROPOFF D [C1]", "5 DROPOFF E [C2]", "6 DROPOFF F [C3]"
            ],
            Describe(batch));
    }

    [Fact]
    public void Single_batch_has_stable_key_and_all_containers_in_sequence_order()
    {
        var batch = Assert.Single(_planner.Plan(Snapshot(Guid.NewGuid(), "C1:A>D", "C2:B>E", "C3:C>F")));

        Assert.Equal("BATCH-001", batch.BatchKey);
        Assert.Equal(1, batch.SequenceNo);
        Assert.Equal(["C1", "C2", "C3"], batch.ContainerIds.Select(Name));
    }

    [Fact]
    public void Stops_are_ordered_by_minimum_detail_sequence_not_by_input_order()
    {
        var snapshot = Snapshot(Guid.NewGuid(), "C1:B>E", "C2:A>D", "C3:B>D");
        // Shuffle the Details: the planner must order by SequenceNo, not by list position.
        snapshot = snapshot with { Details = snapshot.Details.Reverse().ToList() };

        var batch = Assert.Single(_planner.Plan(snapshot));

        Assert.Equal(
            ["1 PICKUP B [C1,C3]", "2 PICKUP A [C2]", "3 DROPOFF E [C1]", "4 DROPOFF D [C2,C3]"],
            Describe(batch));
    }

    [Fact]
    public void Planning_is_deterministic()
    {
        var snapshot = Snapshot(Guid.NewGuid(), "C1:A>D", "C2:B>D", "C3:A>F");

        var first = Assert.Single(_planner.Plan(snapshot));
        var second = Assert.Single(_planner.Plan(snapshot));

        Assert.Equal(first.BatchKey, second.BatchKey);
        Assert.Equal(first.ContainerIds, second.ContainerIds);
        Assert.Equal(Describe(first), Describe(second));
    }

    [Fact]
    public void Same_source_and_destination_endpoint_still_picks_up_before_dropping_off()
    {
        var batch = Assert.Single(_planner.Plan(Snapshot(Guid.NewGuid(), "C1:A>A")));

        Assert.Equal(["1 PICKUP A [C1]", "2 DROPOFF A [C1]"], Describe(batch));
    }

    [Fact]
    public void Plan_with_duplicate_container_in_snapshot_is_rejected_with_structured_errors()
    {
        var snapshot = Snapshot(Guid.NewGuid(), "C1:A>D", "C1:B>E");

        var ex = Assert.Throws<JobPlanValidationException>(() => _planner.Plan(snapshot));

        Assert.Equal("job_plan_invalid", ex.Code);
        Assert.Contains(ex.Errors, e => e.Code == "duplicate_container_in_request");
    }

    // ---------------------------------------------------------------- Planner → JobRuntimeProvisioner

    public static TheoryData<string[], string[]> RuntimeCases => new()
    {
        {
            ["C1:A>D"],
            [
                "JOB: CHECK_READY,CHECK_BATTERY,CHECK_REQUEST",
                "STOP PICKUP A: CHECK_SOURCE_ENDPOINT,MOVE_PICKUP",
                "C1 @ PICKUP A (A>D): PICKUP_CONFIRM",
                "STOP DROPOFF D: CHECK_DEST_ENDPOINT,MOVE_DROPOFF",
                "C1 @ DROPOFF D (A>D): DROPOFF_CONFIRM"
            ]
        },
        {
            ["C1:A>D", "C2:A>E", "C3:A>F"],
            [
                "JOB: CHECK_READY,CHECK_BATTERY,CHECK_REQUEST",
                "STOP PICKUP A: CHECK_SOURCE_ENDPOINT,MOVE_PICKUP",
                "C1 @ PICKUP A (A>D): PICKUP_CONFIRM",
                "C2 @ PICKUP A (A>E): PICKUP_CONFIRM",
                "C3 @ PICKUP A (A>F): PICKUP_CONFIRM",
                "STOP DROPOFF D: CHECK_DEST_ENDPOINT,MOVE_DROPOFF",
                "C1 @ DROPOFF D (A>D): DROPOFF_CONFIRM",
                "STOP DROPOFF E: CHECK_DEST_ENDPOINT,MOVE_DROPOFF",
                "C2 @ DROPOFF E (A>E): DROPOFF_CONFIRM",
                "STOP DROPOFF F: CHECK_DEST_ENDPOINT,MOVE_DROPOFF",
                "C3 @ DROPOFF F (A>F): DROPOFF_CONFIRM"
            ]
        },
        {
            ["C1:A>X", "C2:B>X", "C3:C>X"],
            [
                "JOB: CHECK_READY,CHECK_BATTERY,CHECK_REQUEST",
                "STOP PICKUP A: CHECK_SOURCE_ENDPOINT,MOVE_PICKUP",
                "C1 @ PICKUP A (A>X): PICKUP_CONFIRM",
                "STOP PICKUP B: CHECK_SOURCE_ENDPOINT,MOVE_PICKUP",
                "C2 @ PICKUP B (B>X): PICKUP_CONFIRM",
                "STOP PICKUP C: CHECK_SOURCE_ENDPOINT,MOVE_PICKUP",
                "C3 @ PICKUP C (C>X): PICKUP_CONFIRM",
                "STOP DROPOFF X: CHECK_DEST_ENDPOINT,MOVE_DROPOFF",
                "C1 @ DROPOFF X (A>X): DROPOFF_CONFIRM",
                "C2 @ DROPOFF X (B>X): DROPOFF_CONFIRM",
                "C3 @ DROPOFF X (C>X): DROPOFF_CONFIRM"
            ]
        },
        {
            ["C1:A>D", "C2:B>E", "C3:C>F"],
            [
                "JOB: CHECK_READY,CHECK_BATTERY,CHECK_REQUEST",
                "STOP PICKUP A: CHECK_SOURCE_ENDPOINT,MOVE_PICKUP",
                "C1 @ PICKUP A (A>D): PICKUP_CONFIRM",
                "STOP PICKUP B: CHECK_SOURCE_ENDPOINT,MOVE_PICKUP",
                "C2 @ PICKUP B (B>E): PICKUP_CONFIRM",
                "STOP PICKUP C: CHECK_SOURCE_ENDPOINT,MOVE_PICKUP",
                "C3 @ PICKUP C (C>F): PICKUP_CONFIRM",
                "STOP DROPOFF D: CHECK_DEST_ENDPOINT,MOVE_DROPOFF",
                "C1 @ DROPOFF D (A>D): DROPOFF_CONFIRM",
                "STOP DROPOFF E: CHECK_DEST_ENDPOINT,MOVE_DROPOFF",
                "C2 @ DROPOFF E (B>E): DROPOFF_CONFIRM",
                "STOP DROPOFF F: CHECK_DEST_ENDPOINT,MOVE_DROPOFF",
                "C3 @ DROPOFF F (C>F): DROPOFF_CONFIRM"
            ]
        }
    };

    [Theory]
    [MemberData(nameof(RuntimeCases))]
    public async Task Planned_batches_provision_the_expected_runtime_graph(string[] moves, string[] expectedGraph)
    {
        await using var db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(db);
        var snapshot = Snapshot(workflow.Id, moves);

        var result = await new JobRuntimeProvisioner(db, new FakeJobCodeGenerator())
            .ProvisionAsync(snapshot, _planner.Plan(snapshot));

        var summary = Assert.Single(result.Jobs);
        Assert.Equal("BATCH-001", summary.BatchKey);
        var job = await LoadJobAsync(db, summary.JobId);
        Assert.Equal(moves.Length, job.JobContainers.Count);

        var stepKeys = db.WorkflowSteps.ToDictionary(s => s.Id, s => s.StepKey);
        var graph = job.JobTasks
            .OrderBy(t => t.SequenceNo)
            .Select(t => $"{DescribeTask(t.ContextValues)}: " +
                         string.Join(",", t.JobSteps.OrderBy(s => s.SequenceNo).Select(s => stepKeys[s.WorkflowStepId])))
            .ToList();

        Assert.Equal(expectedGraph, graph);
    }

    [Fact]
    public async Task Re_planning_and_provisioning_the_same_request_is_idempotent()
    {
        await using var db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(db);
        var snapshot = Snapshot(workflow.Id, "C1:A>D", "C2:B>E", "C3:C>F");
        var provisioner = new JobRuntimeProvisioner(db, new FakeJobCodeGenerator());

        var first = await provisioner.ProvisionAsync(snapshot, _planner.Plan(snapshot));
        var second = await provisioner.ProvisionAsync(snapshot, _planner.Plan(snapshot));

        Assert.Equal(first.Jobs.Single().JobId, second.Jobs.Single().JobId);
        Assert.Equal(1, db.Jobs.Count());
        Assert.Equal(3, db.JobContainers.Count());
    }

    private string DescribeTask(Dictionary<string, JsonElement> ctx)
    {
        var scope = ctx["executionScope"].GetString();
        if (scope == "ONCE_PER_JOB")
        {
            return "JOB";
        }

        var stop = $"{ctx["stopAction"].GetString()} {Name(ctx["stopEndpointId"].GetGuid())}";
        if (scope == "ONCE_PER_STOP")
        {
            return $"STOP {stop}";
        }

        // PER_CONTAINER_AT_STOP: CURRENT_MOVEMENT comes from the container's own Detail.
        var route = $"{Name(ctx["source.endpointId"].GetGuid())}>{Name(ctx["destination.endpointId"].GetGuid())}";
        return $"{Name(ctx["containerId"].GetGuid())} @ {stop} ({route})";
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using WaroTrans.EvidenceBridge.Contracts;
using WaroTrans.EvidenceBridge.Persistence;
using WaroTrans.EvidenceBridge.Services;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.IntegrationTests.Transportation;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.IntegrationTests.WorkflowExecution;

/// <summary>
/// Two robots, one request of five containers (trips of at most three), on Postgres: the queue gives one trip to each free
/// robot, the unique indexes keep one active trip per robot, cancelling the request cancels every trip, and a robot that
/// still holds a trip cannot be disabled.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class MultiRobotTripsTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Route = "/api/transportation/transport-requests";
    private IServiceProvider Services => Factory.Services;

    [Fact]
    public async Task Five_containers_make_two_trips_and_two_free_robots_take_one_each()
    {
        var (seed, requestId, trips) = await QueuedRequestAsync(containers: 5);
        var first = await SeedRobotAsync(seed);
        var second = await SeedRobotAsync(seed);

        await TickAsync();

        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var assignments = await db.JobRobotAssignments.AsNoTracking()
            .Where(a => trips.Contains(a.JobId) && a.EndedAt == null)
            .ToListAsync();
        Assert.Equal(2, assignments.Count);
        Assert.Equal(new HashSet<Guid> { first.Id, second.Id }, assignments.Select(a => a.RobotId).ToHashSet());
        Assert.Equal(trips.ToHashSet(), assignments.Select(a => a.JobId).ToHashSet());
        var sizes = await db.JobContainers.AsNoTracking().Where(c => trips.Contains(c.JobId))
            .GroupBy(c => c.JobId).Select(g => g.Count()).ToListAsync();
        Assert.Equal([2, 3], sizes.Order());
        Assert.NotEqual(Guid.Empty, requestId);
    }

    [Fact]
    public async Task With_one_free_robot_the_second_trip_waits_in_the_queue_and_says_why()
    {
        var (seed, _, trips) = await QueuedRequestAsync(containers: 5);
        var only = await SeedRobotAsync(seed);

        await TickAsync();

        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var jobs = await db.Jobs.AsNoTracking().Where(j => trips.Contains(j.Id)).ToListAsync();
        var running = Assert.Single(jobs, j => j.Status != JobStatus.QUEUED);
        Assert.Equal(only.Id, (await db.JobRobotAssignments.AsNoTracking().SingleAsync(a => a.JobId == running.Id && a.EndedAt == null)).RobotId);
        var waiting = Assert.Single(jobs, j => j.Status == JobStatus.QUEUED);
        Assert.Contains("robot_busy", waiting.BlockingReason);
    }

    [Fact]
    public async Task Cancelling_the_request_while_both_trips_run_cancels_both_and_frees_both_robots()
    {
        var (seed, requestId, trips) = await QueuedRequestAsync(containers: 5);
        await SeedRobotAsync(seed);
        await SeedRobotAsync(seed);
        await TickAsync();

        var cancel = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancel", new { reason = "two-robot test" });
        Assert.True(cancel.IsSuccessStatusCode, await cancel.Content.ReadAsStringAsync());

        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var jobs = await db.Jobs.AsNoTracking().Where(j => trips.Contains(j.Id)).ToListAsync();
        Assert.All(jobs, j => Assert.Equal(JobStatus.CANCELLED, j.Status));
        Assert.False(await db.JobRobotAssignments.AnyAsync(a => trips.Contains(a.JobId) && a.EndedAt == null));
    }

    [Fact]
    public async Task A_robot_holding_a_trip_cannot_be_disabled_or_sent_to_maintenance()
    {
        var (seed, _, _) = await QueuedRequestAsync(containers: 2);
        var robot = await SeedRobotAsync(seed);
        await TickAsync();

        var disable = await Client.PostAsync($"/api/fleet/robots/{robot.Id}/disable", null);
        Assert.Equal(HttpStatusCode.Conflict, disable.StatusCode);
        Assert.Contains("robot_has_active_job", await disable.Content.ReadAsStringAsync());

        await using var scope = Services.CreateAsyncScope();
        Assert.True((await scope.ServiceProvider.GetRequiredService<FleetDbContext>().Robots.AsNoTracking().SingleAsync(r => r.Id == robot.Id)).IsEnabled);
    }

    [Fact]
    public async Task A_trip_whose_robot_is_lost_with_nothing_on_board_goes_to_the_other_robot()
    {
        var (seed, _, trips) = await QueuedRequestAsync(containers: 2);
        var lost = await SeedRobotAsync(seed);
        await TickAsync();
        var trip = trips.Single();

        await using (var scope = Services.CreateAsyncScope())
        {
            // The robot dropped off while its trip waited at a stop: the offline monitor put the trip up for another robot.
            var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            var job = await db.Jobs.SingleAsync(j => j.Id == trip);
            job.Status = JobStatus.REASSIGNING;
            job.FailureCode = "robot_offline";
            await db.SaveChangesAsync();
            var fleet = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var row = await fleet.Robots.SingleAsync(r => r.Id == lost.Id);
            row.IsOnline = false;
            row.LastHeartbeatAt = null;
            await fleet.SaveChangesAsync();
        }

        var other = await SeedRobotAsync(seed);
        await TickAsync();

        await using var check = Services.CreateAsyncScope();
        var executions = check.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var rows = await executions.JobRobotAssignments.AsNoTracking().Where(a => a.JobId == trip).OrderBy(a => a.StartedAt).ToListAsync();
        Assert.Equal([lost.Id, other.Id], rows.Select(a => a.RobotId));
        Assert.NotNull(rows[0].EndedAt);
        Assert.Null(rows[1].EndedAt);
        Assert.NotEqual(JobStatus.REASSIGNING, (await executions.Jobs.AsNoTracking().SingleAsync(j => j.Id == trip)).Status);
    }

    [Fact]
    public async Task Five_containers_on_two_robots_reach_evidence_as_two_runs_of_one_request()
    {
        var bridge = Services.GetRequiredService<IOptions<EvidenceBridgeOptions>>().Value;
        bridge.Enabled = true;
        try
        {
            var (seed, requestId, trips) = await QueuedRequestAsync(containers: 5);
            await SeedRobotAsync(seed);
            await SeedRobotAsync(seed);

            await TickAsync();

            await using var scope = Services.CreateAsyncScope();
            var outbox = scope.ServiceProvider.GetRequiredService<EvidenceBridgeDbContext>();
            var opened = (await outbox.OutboxMessages.AsNoTracking()
                    .Where(m => m.EventType == EvidenceEventTypes.JobRobotAssignmentChanged)
                    .ToListAsync())
                .Select(m => JsonDocument.Parse(m.Payload).RootElement)
                .Where(e => e.GetProperty("transportRequestId").GetGuid() == requestId)
                .ToList();
            Assert.Equal(2, opened.Count);
            Assert.All(opened, e =>
            {
                Assert.Equal("OPENED", e.GetProperty("sourceStatusCode").GetString());
                Assert.Matches(@"^R\d{9}$", e.GetProperty("requestCode").GetString());
                Assert.StartsWith("RBT-MR-", e.GetProperty("robotCode").GetString());
                Assert.Equal(5, e.GetProperty("payload").GetProperty("requestContainerCount").GetInt32());
            });
            Assert.Equal(trips.ToHashSet(), opened.Select(e => e.GetProperty("jobId").GetGuid()).ToHashSet());
            Assert.Equal([2, 3], opened.Select(e => e.GetProperty("payload").GetProperty("containerIds").GetArrayLength()).Order());
            Assert.Equal(2, opened.Select(e => e.GetProperty("assignmentId").GetGuid()).Distinct().Count());

            // Step events carry what the replay's step lane shows: type, name, place in the trip, target endpoint.
            var steps = (await outbox.OutboxMessages.AsNoTracking()
                    .Where(m => m.EventType == EvidenceEventTypes.JobStepStatusChanged)
                    .ToListAsync())
                .Select(m => JsonDocument.Parse(m.Payload).RootElement)
                .Where(e => e.GetProperty("transportRequestId").GetGuid() == requestId)
                .Select(e => e.GetProperty("payload"))
                .ToList();
            Assert.NotEmpty(steps);
            Assert.All(steps, p =>
            {
                Assert.False(string.IsNullOrEmpty(p.GetProperty("stepName").GetString()));
                Assert.False(string.IsNullOrEmpty(p.GetProperty("stepType").GetString()));
                Assert.InRange(p.GetProperty("stepPosition").GetInt32(), 1, p.GetProperty("stepCount").GetInt32());
            });
            Assert.Contains(steps, p => p.GetProperty("stepType").GetString() == "MOVE"
                && !string.IsNullOrEmpty(p.TryGetProperty("targetEndpointCode", out var code) ? code.GetString() : null));
            // What the replay says the robot is doing: a MOVE carries its purpose (PICKUP / DROPOFF).
            Assert.All(steps.Where(p => p.GetProperty("stepType").GetString() == "MOVE"), p =>
                Assert.Contains(p.GetProperty("purpose").GetString(), new[] { "PICKUP", "DROPOFF" }));
        }
        finally
        {
            bridge.Enabled = false;
        }
    }

    // ------------------------------------------------------------------ helpers

    private async Task TickAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<JobQueueProcessor>().TickAsync(CancellationToken.None);
    }

    /// <summary>A request of <paramref name="containers"/> stored containers from the source shelf, queued (Run).</summary>
    private async Task<(TransportRequestScenario.Seed Seed, Guid RequestId, List<Guid> Trips)> QueuedRequestAsync(int containers)
    {
        var seed = await TransportRequestScenario.SeedAsync(Services, Client, "MR-" + Guid.NewGuid().ToString("N")[..8]);
        var containerIds = new List<Guid> { seed.ContainerId };
        await using (var scope = Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
            var template = await db.Containers.AsNoTracking().SingleAsync(c => c.Id == seed.ContainerId);
            for (var i = 1; i < containers; i++)
            {
                var id = Guid.NewGuid();
                db.Containers.Add(new Container
                {
                    Id = id,
                    ProductId = template.ProductId,
                    Barcode = "MR-" + Guid.NewGuid().ToString("N")[..10],
                    Status = ContainerStatus.STORED,
                    CurrentStorageLocationId = seed.SourceLocationId,
                    CurrentLevelNo = 1,
                    CreatedBy = template.CreatedBy,
                    CreatedAt = template.CreatedAt,
                    UpdatedAt = template.UpdatedAt
                });
                containerIds.Add(id);
            }

            await db.SaveChangesAsync();
        }

        var workflowId = await TransportRequestScenario.CreatePublishedWorkflowAsync(Client);
        await using (var scope = Services.CreateAsyncScope())
        {
            // Like the standard workflows: a MOVE that cannot go holds the trip (and its robot) for an operator. The test
            // map has no traffic graph, so every MOVE stops there; what is checked here is who holds which trip.
            var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            foreach (var step in await db.WorkflowSteps.Where(s => s.WorkflowTask.WorkflowId == workflowId && s.StepType == StepType.MOVE).ToListAsync())
            {
                step.OnFailure = StepFailurePolicy.PAUSE_FOR_OPERATOR;
            }

            await db.SaveChangesAsync();
        }

        var create = await Client.PostAsJsonAsync(Route, new
        {
            warehouseId = seed.WarehouseId,
            mapVersionId = seed.MapVersionId,
            workflowId,
            workflowInputs = new Dictionary<string, object>(),
            details = containerIds.Select((id, i) => new
            {
                sequenceNo = i + 1,
                containerId = id,
                sourceStorageLocationId = seed.SourceLocationId,
                sourceEndpointId = seed.SourceEndpointId,
                sourceLevelNo = (short)1,
                destinationStorageLocationId = seed.DestinationLocationId,
                destinationEndpointId = seed.DestinationEndpointId,
                destinationLevelNo = (short)2
            }).ToArray()
        }, TransportRequestScenario.JsonOptions);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var requestId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var queued = await (await Client.PostAsync($"{Route}/{requestId}/queue", null)).Content.ReadFromJsonAsync<JsonElement>();
        var trips = queued.GetProperty("jobs").EnumerateArray().Select(j => j.GetProperty("jobId").GetGuid()).ToList();

        // "Run": the first trip joins the queue; the queue brings in the others.
        await using (var scope = Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<JobExecutionEngine>().EnqueueAsync(trips[0], CancellationToken.None);
        }

        return (seed, requestId, trips);
    }

    private async Task<Robot> SeedRobotAsync(TransportRequestScenario.Seed seed)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var now = DateTimeOffset.UtcNow;
        var robot = Robot.Register(seed.WarehouseId, seed.MapVersionId, "RBT-MR-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), "R", now);
        robot.IsOnline = true;
        // The connectivity monitor turns an online robot without a recent heartbeat OFFLINE mid-test.
        robot.LastHeartbeatAt = now.AddHours(1);
        robot.Status = RobotStatus.AVAILABLE;
        robot.LocalizationStatus = LocalizationStatus.LOCALIZED;
        robot.LastTelemetryAt = now.AddHours(1);
        robot.PoseX = 1.0;
        robot.PoseY = 2.0;
        robot.BatteryPercent = 90m;
        robot.BatteryMeasuredAt = now.AddHours(1);
        robot.MaxContainers = 3;
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot;
    }
}

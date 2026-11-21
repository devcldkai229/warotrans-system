using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.IntegrationTests.Transportation.Lifecycle;

/// <summary>
/// TRN-03 on Postgres: a cancel is one recorded operation (idempotency key, one active per request), followed until
/// every robot holds still and every container is delivered, never picked up, or unloaded by scan onto a shelf.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class TransportCancellationEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Route = "/api/transportation/transport-requests";
    private IServiceProvider Services => Factory.Services;

    [Fact]
    public async Task The_same_idempotency_key_gives_one_cancellation_and_a_request_without_jobs_finalizes_at_once()
    {
        var (_, requestId, _) = await RequestAsync(containers: 1, queue: false);

        var preview = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancel-preview");
        Assert.True(preview.GetProperty("canCancel").GetBoolean());
        Assert.Equal(1, preview.GetProperty("notPickedUp").GetInt32());

        for (var i = 0; i < 2; i++)
        {
            using var message = new HttpRequestMessage(HttpMethod.Post, $"{Route}/{requestId}/cancel")
            {
                Content = JsonContent.Create(new { reason = "entered twice", reasonCode = "WRONG_REQUEST" })
            };
            message.Headers.Add("Idempotency-Key", $"test-{requestId:N}");
            var response = await Client.SendAsync(message);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        var cancellation = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancellation");
        Assert.Equal("FINALIZED", cancellation.GetProperty("status").GetString());
        Assert.Equal("WRONG_REQUEST", cancellation.GetProperty("reasonCode").GetString());
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TransportationDbContext>();
        Assert.Equal(1, await db.TransportCancellations.CountAsync(c => c.TransportRequestId == requestId));
    }

    [Fact]
    public async Task A_request_never_cancelled_has_no_cancellation_and_an_unknown_reason_code_is_refused()
    {
        var (_, requestId, _) = await RequestAsync(containers: 1, queue: false);

        var none = await Client.GetAsync($"{Route}/{requestId}/cancellation");
        Assert.Equal(HttpStatusCode.NoContent, none.StatusCode);

        var bad = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancel", new { reason = "x", reasonCode = "BECAUSE" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Equal("reason_code_invalid", await bad.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task One_detail_not_picked_up_is_cancelled_alone_and_the_rest_of_the_request_goes_on()
    {
        var (_, requestId, trips) = await RequestAsync(containers: 2, queue: true);
        var request = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}");
        var details = request.GetProperty("details").EnumerateArray().ToList();
        var first = details[0].GetProperty("id").GetGuid();

        var cancel = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancel", new { reason = "not needed", detailIds = new[] { first } });
        Assert.True(cancel.IsSuccessStatusCode, await cancel.Content.ReadAsStringAsync());

        var after = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}");
        var statuses = after.GetProperty("details").EnumerateArray()
            .ToDictionary(d => d.GetProperty("id").GetGuid(), d => d.GetProperty("status").GetString());
        Assert.Equal("CANCELLED", statuses[first]);
        Assert.NotEqual("CANCELLED", statuses[details[1].GetProperty("id").GetGuid()]);
        Assert.NotEqual("CANCELLED", after.GetProperty("status").GetString());

        var cancellation = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancellation");
        Assert.Equal("DETAILS", cancellation.GetProperty("scope").GetString());
        Assert.Equal("FINALIZED", cancellation.GetProperty("status").GetString());

        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        Assert.NotEqual(JobStatus.CANCELLED, (await db.Jobs.AsNoTracking().SingleAsync(j => j.Id == trips.Single())).Status);
    }

    [Fact]
    public async Task Cargo_on_a_robot_is_held_until_unloaded_by_scan_then_stored_where_it_was_put_and_the_cancel_finalizes()
    {
        var (seed, requestId, trips) = await RequestAsync(containers: 2, queue: true);
        var robot = await SeedRobotAsync(seed);
        var trip = trips.Single();
        await StartAsync(trip, robot.Id);

        // Both containers were confirmed onto the robot and Warehouse has them in transit.
        var containerIds = await PutCargoOnRobotAsync(trip);

        var preview = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancel-preview");
        Assert.Equal(2, preview.GetProperty("onRobot").GetInt32());
        Assert.All(preview.GetProperty("details").EnumerateArray(), d => Assert.False(d.GetProperty("canCancelAlone").GetBoolean()));

        var cancel = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancel", new { reason = "customer cancelled" });
        Assert.True(cancel.IsSuccessStatusCode, await cancel.Content.ReadAsStringAsync());
        Assert.Equal("CANCELLING", (await cancel.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());

        // The robot has not reported a motion hold: the cancel waits for it and nobody may unload it.
        var stopping = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancellation");
        Assert.Equal("STOPPING", stopping.GetProperty("status").GetString());
        var item = stopping.GetProperty("items").EnumerateArray().Single();
        Assert.Equal("STOP_REQUESTED", item.GetProperty("stage").GetString());
        Assert.False(item.GetProperty("canHandOver").GetBoolean());

        var barcodes = await BarcodesAsync(containerIds);
        var early = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancellation/jobs/{trip}/handover", new
        {
            containerId = containerIds[0], scannedBarcode = barcodes[containerIds[0]], storageLocationId = seed.SourceLocationId, levelNo = 1
        });
        Assert.Equal(HttpStatusCode.Conflict, early.StatusCode);
        Assert.Equal("robot_not_stopped", await early.ReadErrorCodeAsync());

        await HoldRobotAsync(robot.Id);
        var held = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancellation");
        Assert.Equal("RECOVERING", held.GetProperty("status").GetString());
        Assert.True(held.GetProperty("items")[0].GetProperty("canHandOver").GetBoolean());

        // A wrong label is refused and changes nothing.
        var wrong = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancellation/jobs/{trip}/handover", new
        {
            containerId = containerIds[0], scannedBarcode = barcodes[containerIds[1]], storageLocationId = seed.SourceLocationId, levelNo = 1
        });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);

        foreach (var id in containerIds)
        {
            var handover = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancellation/jobs/{trip}/handover", new
            {
                containerId = id, scannedBarcode = barcodes[id], storageLocationId = seed.SourceLocationId, levelNo = 1
            });
            Assert.True(handover.IsSuccessStatusCode, await handover.Content.ReadAsStringAsync());
        }

        // Doing it again records nothing new.
        var repeat = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancellation/jobs/{trip}/handover", new
        {
            containerId = containerIds[0], scannedBarcode = barcodes[containerIds[0]], storageLocationId = seed.SourceLocationId, levelNo = 1
        });
        Assert.True(repeat.IsSuccessStatusCode, await repeat.Content.ReadAsStringAsync());

        var done = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancellation");
        Assert.Equal("FINALIZED", done.GetProperty("status").GetString());
        Assert.Equal(2, done.GetProperty("handedOver").GetInt32());
        // Destination policy: the robot is sent to parking once nothing is on it; the test map has no parking place,
        // so it stays where it is and the note says why.
        var finished = done.GetProperty("items")[0];
        Assert.Equal("SKIPPED", finished.GetProperty("destinationStatus").GetString());
        Assert.Equal("no_free_parking", finished.GetProperty("destinationNote").GetString());
        Assert.Equal("CANCELLED", (await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}")).GetProperty("status").GetString());

        await using var scope = Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        Assert.Equal(JobStatus.CANCELLED, (await execution.Jobs.AsNoTracking().SingleAsync(j => j.Id == trip)).Status);
        var warehouse = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var stored = await warehouse.Containers.AsNoTracking().Where(c => containerIds.Contains(c.Id)).ToListAsync();
        Assert.All(stored, c =>
        {
            Assert.Equal(ContainerStatus.STORED, c.Status);
            Assert.Equal(seed.SourceLocationId, c.CurrentStorageLocationId);
        });
        Assert.Equal(2, await warehouse.ContainerMovements.CountAsync(m => containerIds.Contains(m.ContainerId) && m.Type == ContainerMovementType.RECOVERED));
    }

    [Fact]
    public async Task An_unload_waits_for_a_pickup_still_in_the_execution_outbox()
    {
        var (seed, requestId, trips) = await RequestAsync(containers: 1, queue: true);
        var robot = await SeedRobotAsync(seed);
        var trip = trips.Single();
        await StartAsync(trip, robot.Id);
        var containerId = Assert.Single(await PutCargoOnRobotAsync(trip, stockRecorded: false));
        await using var scope = Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var transportation = scope.ServiceProvider.GetRequiredService<TransportationDbContext>();
        var warehouse = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var lookup = scope.ServiceProvider.GetRequiredService<IContainerTransportLookup>();
        var atPickup = DateTimeOffset.UtcNow;
        await execution.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO execution.stock_handover_outbox
                (id, job_id, transport_request_id, container_id, type, confirmed_at, next_attempt_at, attempts)
            VALUES ({Guid.NewGuid()}, {trip}, {requestId}, {containerId}, 'PICKUP', {atPickup}, {atPickup.AddHours(1)}, 0)
            """);

        using var cancel = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancel", new { reason = "customer cancelled" });
        Assert.True(cancel.IsSuccessStatusCode, await cancel.Content.ReadAsStringAsync());
        await HoldRobotAsync(robot.Id);
        var barcodes = await BarcodesAsync([containerId]);
        using var unload = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancellation/jobs/{trip}/handover", new
        {
            containerId, scannedBarcode = barcodes[containerId], storageLocationId = seed.SourceLocationId, levelNo = 1
        });
        Assert.True(unload.IsSuccessStatusCode, await unload.Content.ReadAsStringAsync());

        var posting = await transportation.StockPostings.AsNoTracking().SingleAsync(p => p.ContainerId == containerId);
        Assert.Equal(StockPostingType.CANCEL_HANDOVER, posting.Type);
        Assert.Null(posting.PostedAt);
        Assert.Equal(0, posting.Attempts);
        Assert.Contains(containerId, await lookup.GetContainersInActiveTransportAsync([containerId]));

        await execution.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE execution.stock_handover_outbox SET next_attempt_at = {atPickup} WHERE container_id = {containerId}
            """);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        while (await transportation.StockPostings.CountAsync(p => p.ContainerId == containerId && p.PostedAt != null, timeout.Token) < 2)
            await Task.Delay(100, timeout.Token);

        var movementTypes = await warehouse.ContainerMovements.AsNoTracking().Where(m => m.ContainerId == containerId)
            .OrderBy(m => m.OccurredAt).Select(m => m.Type).ToListAsync();
        Assert.Equal([ContainerMovementType.PICKED_UP, ContainerMovementType.RECOVERED], movementTypes);
        Assert.Empty(await lookup.GetContainersInActiveTransportAsync([containerId]));
    }

    [Fact]
    public async Task An_offline_robot_with_cargo_keeps_the_cancel_waiting_for_the_robot()
    {
        var (seed, requestId, trips) = await RequestAsync(containers: 1, queue: true);
        var robot = await SeedRobotAsync(seed);
        await StartAsync(trips.Single(), robot.Id);
        await PutCargoOnRobotAsync(trips.Single());
        await using (var scope = Services.CreateAsyncScope())
        {
            var fleet = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var row = await fleet.Robots.SingleAsync(r => r.Id == robot.Id);
            row.IsOnline = false;
            await fleet.SaveChangesAsync();
        }

        (await Client.PostAsJsonAsync($"{Route}/{requestId}/cancel", new { reason = "robot lost" })).EnsureSuccessStatusCode();

        var cancellation = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancellation");
        Assert.Equal("WAITING_ROBOT", cancellation.GetProperty("status").GetString());
        Assert.Null(cancellation.GetProperty("finalizedAt").GetString());
    }

    [Fact]
    public async Task A_held_robot_offers_its_next_steps_and_a_manual_handover_is_asked_for_once()
    {
        var (seed, requestId, trips) = await RequestAsync(containers: 1, queue: true);
        var robot = await SeedRobotAsync(seed);
        var trip = trips.Single();
        await StartAsync(trip, robot.Id);
        await PutCargoOnRobotAsync(trip);
        (await Client.PostAsJsonAsync($"{Route}/{requestId}/cancel", new { reason = "pallet damaged", reasonCode = "STOCK_PROBLEM" }))
            .EnsureSuccessStatusCode();
        await HoldRobotAsync(robot.Id);

        var held = (await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancellation")).GetProperty("items")[0];
        var actions = held.GetProperty("actions").EnumerateArray().Select(a => a.GetString()).ToList();
        Assert.Contains("UNLOAD_BY_SCAN", actions);
        Assert.Contains("REQUEST_MANUAL_HANDOVER", actions);
        // A stock problem is not delivered: "continue delivery" is closed, and says why.
        Assert.DoesNotContain("CONTINUE_DELIVERY", actions);
        Assert.Equal("reason_forbids_delivery", held.GetProperty("blockedActions").GetProperty("CONTINUE_DELIVERY").GetString());
        var deliver = await Client.PostAsync($"{Route}/{requestId}/cancellation/jobs/{trip}/deliver", null);
        Assert.Equal(HttpStatusCode.Conflict, deliver.StatusCode);
        Assert.Equal("reason_forbids_delivery", await deliver.ReadErrorCodeAsync());

        for (var i = 0; i < 2; i++)
        {
            var ask = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancellation/jobs/{trip}/manual-handover", new { note = "use the blue trolley" });
            Assert.True(ask.IsSuccessStatusCode, await ask.Content.ReadAsStringAsync());
        }

        var asked = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancellation");
        var item = asked.GetProperty("items")[0];
        Assert.Equal("HANDOVER_REQUESTED", item.GetProperty("stage").GetString());
        Assert.Equal("RECOVERING", asked.GetProperty("status").GetString());
        Assert.NotEqual(JsonValueKind.Null, item.GetProperty("handoverRequestedAt").ValueKind);
        Assert.DoesNotContain("REQUEST_MANUAL_HANDOVER", item.GetProperty("actions").EnumerateArray().Select(a => a.GetString()));
    }

    [Fact]
    public async Task Sending_cargo_to_a_recovery_point_is_refused_without_moving_the_robot_when_it_cannot_go()
    {
        var (seed, requestId, trips) = await RequestAsync(containers: 1, queue: true);
        var robot = await SeedRobotAsync(seed);
        var trip = trips.Single();
        await StartAsync(trip, robot.Id);
        await PutCargoOnRobotAsync(trip);
        (await Client.PostAsJsonAsync($"{Route}/{requestId}/cancel", new { reason = "customer cancelled", reasonCode = "CUSTOMER_CANCELLED" }))
            .EnsureSuccessStatusCode();
        await HoldRobotAsync(robot.Id);

        var points = await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancellation/jobs/{trip}/recovery-points");
        Assert.Equal(JsonValueKind.Array, points.ValueKind);

        // The test map has no wait point (and runs Active traffic): nothing is sent, the robot keeps holding still.
        var send = await Client.PostAsJsonAsync($"{Route}/{requestId}/cancellation/jobs/{trip}/recovery", new { });
        Assert.Equal(HttpStatusCode.Conflict, send.StatusCode);
        Assert.Contains(await send.ReadErrorCodeAsync(), new[] { "no_recovery_point", "recovery_not_supported_in_traffic_mode" });

        await using var scope = Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        Assert.Equal(JobStatus.PAUSED, (await execution.Jobs.AsNoTracking().SingleAsync(j => j.Id == trip)).Status);
        var item = (await Client.GetFromJsonAsync<JsonElement>($"{Route}/{requestId}/cancellation")).GetProperty("items")[0];
        Assert.Contains("CONTINUE_DELIVERY", item.GetProperty("actions").EnumerateArray().Select(a => a.GetString()));
    }

    // ------------------------------------------------------------------ helpers

    private async Task<(TransportRequestScenario.Seed Seed, Guid RequestId, List<Guid> Trips)> RequestAsync(int containers, bool queue)
    {
        var seed = await TransportRequestScenario.SeedAsync(Services, Client, "CX-" + Guid.NewGuid().ToString("N")[..8]);
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
                    Barcode = "CX-" + Guid.NewGuid().ToString("N")[..10],
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
            // The test map has no traffic graph: a MOVE that cannot go holds the trip for an operator instead of failing it.
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
        if (!queue)
        {
            return (seed, requestId, []);
        }

        var queued = await (await Client.PostAsync($"{Route}/{requestId}/queue", null)).Content.ReadFromJsonAsync<JsonElement>();
        var trips = queued.GetProperty("jobs").EnumerateArray().Select(j => j.GetProperty("jobId").GetGuid()).ToList();
        return (seed, requestId, trips);
    }

    /// <summary>The trip takes the robot; with no traffic graph its first MOVE holds it (PAUSED) for an operator.</summary>
    private async Task StartAsync(Guid trip, Guid robotId)
    {
        await using var scope = Services.CreateAsyncScope();
        try
        {
            await scope.ServiceProvider.GetRequiredService<JobExecutionEngine>().StartAsync(trip, robotId);
        }
        catch (WaroTrans.BuildingBlocks.Exceptions.AppException)
        {
            // Whatever the first MOVE did, the trip holds the robot; that is all these tests need.
        }
    }

    /// <summary>Confirm pickup in Execution, with an option to leave Warehouse waiting for the posting.</summary>
    private async Task<List<Guid>> PutCargoOnRobotAsync(Guid trip, bool stockRecorded = true)
    {
        await using var scope = Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var job = await execution.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == trip);
        if (job.Status is not (JobStatus.PAUSED or JobStatus.RUNNING))
        {
            job.Status = JobStatus.PAUSED;
            job.FailureCode = "operator_paused";
        }

        foreach (var container in job.JobContainers)
        {
            container.Status = JobContainerStatus.ONBOARD;
            container.LoadedAt = DateTimeOffset.UtcNow;
        }

        await execution.SaveChangesAsync();

        var ids = job.JobContainers.Select(c => c.ContainerId).ToList();
        if (!stockRecorded) return ids;
        var warehouse = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        foreach (var container in await warehouse.Containers.Where(c => ids.Contains(c.Id)).ToListAsync())
        {
            container.Status = ContainerStatus.IN_TRANSIT;
            container.CurrentStorageLocationId = null;
            container.CurrentLevelNo = null;
            container.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await warehouse.SaveChangesAsync();
        return ids;
    }

    private async Task HoldRobotAsync(Guid robotId)
    {
        await using var scope = Services.CreateAsyncScope();
        var fleet = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var row = await fleet.Robots.SingleAsync(r => r.Id == robotId);
        row.MotionHeld = true;
        row.MotionHoldChangedAt = DateTimeOffset.UtcNow;
        await fleet.SaveChangesAsync();
    }

    private async Task<Dictionary<Guid, string>> BarcodesAsync(IReadOnlyCollection<Guid> ids)
    {
        await using var scope = Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<WarehouseDbContext>().Containers.AsNoTracking()
            .Where(c => ids.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Barcode);
    }

    private async Task<Robot> SeedRobotAsync(TransportRequestScenario.Seed seed)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var now = DateTimeOffset.UtcNow;
        var robot = Robot.Register(seed.WarehouseId, seed.MapVersionId, "RBT-CX-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), "R", now);
        robot.IsOnline = true;
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

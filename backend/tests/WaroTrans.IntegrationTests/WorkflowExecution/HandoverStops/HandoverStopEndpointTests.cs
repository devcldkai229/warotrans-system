using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.ProcessRobotInteractionConfirm;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Services;
using Product = WaroTrans.Warehouse.Entities.Product;
using ProductCategory = WaroTrans.Warehouse.Entities.ProductCategory;
using WarehouseContainer = WaroTrans.Warehouse.Entities.Container;
using WarehouseEntity = WaroTrans.Warehouse.Entities.Warehouse;

namespace WaroTrans.IntegrationTests.WorkflowExecution.HandoverStops;

[Collection(IntegrationCollection.Name)]
public sealed class HandoverStopEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task A_stop_opens_after_the_move_ack_and_keeps_its_owner_after_begin()
    {
        var first = await Factory.CreateAccountAsync("handover-first", AccountRole.STAFF);
        var second = await Factory.CreateAccountAsync("handover-second", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var firstToken = (await client.LoginAsync(first.Username)).AccessToken;
        var secondToken = (await client.LoginAsync(second.Username)).AccessToken;
        var (job, stop, move, handover, moveId) = await SeedAsync(first.Id);
        const string queue = "/api/workflow-execution/handover-stops";
        var change = $"/api/workflow-execution/jobs/{job.Id}/handover-stops/{stop.Id}";

        using var withoutAck = await client.GetWithTokenAsync(queue, firstToken);
        Assert.Empty((await ReadAsync(withoutAck)).GetProperty("items").EnumerateArray());

        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var storedMove = await db.JobSteps.FindAsync(move.Id) ?? throw new InvalidOperationException("Test MOVE missing.");
        storedMove.AcceptedMoveCommandId = moveId;
        storedMove.MoveAcceptedAt = DateTimeOffset.UtcNow.AddSeconds(5);
        await db.SaveChangesAsync();
        using var early = await client.SendWithTokenAsync(HttpMethod.Post, $"{change}/claim", firstToken, new { moveId, version = 0 });
        Assert.Equal(HttpStatusCode.Conflict, early.StatusCode);
        Assert.Equal("handover_stop_not_open", await early.ReadErrorCodeAsync());

        var accepted = DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.ToUnixTimeSeconds()).AddSeconds(-11);
        storedMove.MoveAcceptedAt = accepted;
        await db.SaveChangesAsync();
        using var open = await client.GetWithTokenAsync(queue, firstToken);
        var offer = Assert.Single((await ReadAsync(open)).GetProperty("items").EnumerateArray());
        Assert.Equal(stop.Id, offer.GetProperty("id").GetGuid());
        Assert.Equal(accepted.AddSeconds(10), offer.GetProperty("offerOpensAt").GetDateTimeOffset());
        Assert.Single(offer.GetProperty("containers").EnumerateArray());

        var claims = await Task.WhenAll(new[] { firstToken, secondToken }.Select(token => client.SendWithTokenAsync(
            HttpMethod.Post, $"{change}/claim", token, new { moveId, version = 0 })));
        try
        {
            var winner = Assert.Single(claims, response => response.StatusCode == HttpStatusCode.OK);
            Assert.Single(claims, response => response.StatusCode == HttpStatusCode.Conflict);
            var winnerToken = winner == claims[0] ? firstToken : secondToken;
            var winnerId = winner == claims[0] ? first.Id : second.Id;
            var claimed = await ReadAsync(winner);
            Assert.Equal(winnerId, claimed.GetProperty("claimedBy").GetGuid());
            Assert.Null(OptionalTime(claimed, "beginDeadline"));
            var version = claimed.GetProperty("version").GetInt32();

            using var tooSoon = await client.SendWithTokenAsync(HttpMethod.Post, $"{change}/begin", winnerToken, new { moveId, version });
            Assert.Equal("handover_robot_not_ready", await tooSoon.ReadErrorCodeAsync());

            var ready = DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.ToUnixTimeSeconds());
            storedMove.Status = JobStepStatus.COMPLETED;
            storedMove.CompletedAt = ready;
            var storedHandover = await db.JobSteps.FindAsync(handover.Id) ?? throw new InvalidOperationException("Test handover missing.");
            storedHandover.Status = JobStepStatus.WAITING;
            storedHandover.StartedAt = ready;
            await db.SaveChangesAsync();

            using var mine = await client.GetWithTokenAsync($"{queue}?mine=true", winnerToken);
            var readyOffer = Assert.Single((await ReadAsync(mine)).GetProperty("items").EnumerateArray());
            Assert.Equal(ready, OptionalTime(readyOffer, "robotReadyAt"));
            Assert.True(OptionalTime(readyOffer, "beginDeadline") > ready);

            using var begun = await client.SendWithTokenAsync(HttpMethod.Post, $"{change}/begin", winnerToken, new { moveId, version });
            Assert.Equal(HttpStatusCode.OK, begun.StatusCode);
            var begunOffer = await ReadAsync(begun);
            Assert.NotNull(OptionalTime(begunOffer, "beganAt"));
            Assert.Null(OptionalTime(begunOffer, "beginDeadline"));

            using var release = await client.SendWithTokenAsync(HttpMethod.Post, $"{change}/release", winnerToken,
                new { moveId, version = begunOffer.GetProperty("version").GetInt32() });
            Assert.Equal("handover_already_began", await release.ReadErrorCodeAsync());
        }
        finally
        {
            foreach (var response in claims) response.Dispose();
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Confirm_all_verifies_the_entire_stop_and_records_each_container_once(bool robotButton)
    {
        var owner = await Factory.CreateAccountAsync("handover-owner", AccountRole.STAFF);
        var peer = await Factory.CreateAccountAsync("handover-peer", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var ownerToken = (await client.LoginAsync(owner.Username)).AccessToken;
        var peerToken = (await client.LoginAsync(peer.Username)).AccessToken;
        var (job, stop, move, firstStep, moveId) = await SeedAsync(owner.Id);

        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var warehouse = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var settings = scope.ServiceProvider.GetRequiredService<IOptions<HumanTaskOptions>>().Value;
        var fleet = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = Robot.Register(Guid.NewGuid(), job.MapVersionId, "RBT-HANDOVER", "Handover robot", DateTimeOffset.UtcNow);
        if (robotButton)
        {
            robot.Status = RobotStatus.AVAILABLE;
            robot.IsOnline = true;
            robot.LastHeartbeatAt = DateTimeOffset.UtcNow.AddHours(1);
            robot.Capabilities = RobotHandoverStop.Capability;
            fleet.Add(robot);
            await fleet.SaveChangesAsync();
            var trackedJob = (await db.Jobs.FindAsync(job.Id))!;
            trackedJob.ContextValues = new() { [JobExecutionEngine.AssignedRobotKey] = JsonSerializer.SerializeToElement(robot.Id) };
        }
        var firstTask = (await db.JobTasks.FindAsync(firstStep.JobTaskId))!;
        var firstId = firstTask.ContextValues["containerId"].GetGuid();
        var secondId = Guid.NewGuid();
        var endpoint = move.TargetEndpointId!.Value;
        firstTask.ContextValues = new(firstTask.ContextValues) { ["source.endpointId"] = JsonSerializer.SerializeToElement(endpoint) };
        var secondTask = new JobTask
        {
            Id = Guid.NewGuid(), JobId = job.Id, WorkflowTaskId = firstTask.WorkflowTaskId, SequenceNo = 3,
            Status = JobTaskStatus.PENDING,
            ContextValues = new(firstTask.ContextValues) { ["containerId"] = JsonSerializer.SerializeToElement(secondId) }
        };
        db.Add(secondTask);
        db.Add(new JobStep
        {
            Id = Guid.NewGuid(), JobTaskId = secondTask.Id, WorkflowStepId = firstStep.WorkflowStepId, SequenceNo = 1,
            StepType = StepType.HUMAN_INTERACTION, Status = JobStepStatus.PENDING
        });

        var now = DateTimeOffset.UtcNow;
        var storedMove = (await db.JobSteps.FindAsync(move.Id))!;
        storedMove.Status = JobStepStatus.COMPLETED;
        storedMove.AcceptedMoveCommandId = moveId;
        storedMove.MoveAcceptedAt = now.AddSeconds(-20);
        storedMove.CompletedAt = now;
        var storedStep = (await db.JobSteps.FindAsync(firstStep.Id))!;
        storedStep.Status = JobStepStatus.WAITING;
        storedStep.StartedAt = now;
        storedStep.ResolvedInputs = new()
        {
            ["containerId"] = JsonSerializer.SerializeToElement(firstId),
            ["endpointId"] = JsonSerializer.SerializeToElement(endpoint)
        };
        var definition = (await db.WorkflowSteps.FindAsync(firstStep.WorkflowStepId))!;
        definition.InputBindings = new()
        {
            ["robotId"] = new() { SourceType = BindingSourceType.CONSTANT, ConstantValue = JsonSerializer.SerializeToElement(robot.Id) },
            ["containerId"] = new() { SourceType = BindingSourceType.CURRENT_MOVEMENT, SourceReference = "containerId" },
            ["endpointId"] = new() { SourceType = BindingSourceType.CURRENT_MOVEMENT, SourceReference = "source.endpointId" }
        };
        var sequence = 0;
        foreach (var id in new[] { firstId, secondId })
        {
            db.JobContainers.Add(new JobContainer
            {
                Id = Guid.NewGuid(), ContainerId = id, TransportRequestId = Guid.NewGuid(), JobId = job.Id,
                SequenceNo = ++sequence, Status = JobContainerStatus.ASSIGNED, CreatedAt = now, UpdatedAt = now
            });
        }
        await db.SaveChangesAsync();

        var category = new ProductCategory { Id = Guid.NewGuid(), Code = "HANDOVER", Name = "Handover" };
        var product = new Product { Id = Guid.NewGuid(), CategoryId = category.Id, Sku = "HANDOVER", Name = "Handover", IsActive = true };
        warehouse.AddRange(category, product,
            new WarehouseContainer { Id = firstId, ProductId = product.Id, Barcode = "HANDOVER-1", CreatedBy = owner.Id },
            new WarehouseContainer { Id = secondId, ProductId = product.Id, Barcode = "HANDOVER-2", CreatedBy = owner.Id });
        await warehouse.SaveChangesAsync();

        var path = $"/api/workflow-execution/jobs/{job.Id}/handover-stops/{stop.Id}";
        using var claim = await client.SendWithTokenAsync(HttpMethod.Post, $"{path}/claim", ownerToken, new { moveId, version = 0 });
        var claimed = await ReadAsync(claim);
        using var legacy = await client.SendWithTokenAsync(HttpMethod.Post,
            $"/api/workflow-execution/job-steps/{firstStep.Id}/confirm", peerToken, new { containerId = firstId });
        Assert.Equal("handover_stop_confirmation_required", await legacy.ReadErrorCodeAsync());
        var oldButtonSetting = settings.EnableHandoverStopButton;
        var mqtt = scope.ServiceProvider.GetRequiredService<CapturingMqttRobotCommandPublisher>();
        int version;
        try
        {
            settings.EnableHandoverStopButton = robotButton;
            using var begin = await client.SendWithTokenAsync(HttpMethod.Post, $"{path}/begin", ownerToken,
                new { moveId, version = claimed.GetProperty("version").GetInt32() });
            version = (await ReadAsync(begin)).GetProperty("version").GetInt32();
        }
        finally
        {
            settings.EnableHandoverStopButton = oldButtonSetting;
        }

        var completeScans = new[] { new { containerId = firstId, barcode = "HANDOVER-1" }, new { containerId = secondId, barcode = "HANDOVER-2" } };
        using var wrongOwner = await client.SendWithTokenAsync(HttpMethod.Post, $"{path}/confirm", peerToken,
            new { moveId, version, scans = completeScans });
        Assert.Equal("handover_stop_claim_required", await wrongOwner.ReadErrorCodeAsync());
        using var partial = await client.SendWithTokenAsync(HttpMethod.Post, $"{path}/confirm", ownerToken,
            new { moveId, version, scans = completeScans[..1] });
        Assert.Equal("handover_scan_manifest_mismatch", await partial.ReadErrorCodeAsync());
        using var wrongScan = await client.SendWithTokenAsync(HttpMethod.Post, $"{path}/confirm", ownerToken,
            new { moveId, version, scans = new[] { completeScans[0], new { containerId = secondId, barcode = "HANDOVER-1" } } });
        Assert.Equal("handover_barcode_mismatch", await wrongScan.ReadErrorCodeAsync());
        Assert.Empty(await db.HandoverConfirmations.AsNoTracking().ToListAsync());

        var confirmation = new { moveId, version, scans = completeScans };
        const string issuesPath = "/api/operations/issues";
        using var report = await client.SendWithTokenAsync(HttpMethod.Post, issuesPath, ownerToken, new
        {
            issueType = "CONTAINER", problemCode = "MISSING_CONTAINER", severity = "HIGH",
            description = "Second piece missing", jobId = job.Id, containerId = secondId
        });
        Assert.Equal(HttpStatusCode.Created, report.StatusCode);
        var issue = await ReadAsync(report);
        var resolvePath = $"{issuesPath}/{issue.GetProperty("id").GetGuid()}/resolve-handover";
        var issueVersion = issue.GetProperty("version").GetInt32();
        var validResolution = new { expectedVersion = issueVersion, scannedBarcode = "HANDOVER-2", resolution = "Found the expected container" };
        using var blocked = await client.SendWithTokenAsync(HttpMethod.Post, $"{path}/confirm", ownerToken, confirmation);
        Assert.Equal("handover_issue_blocking", await blocked.ReadErrorCodeAsync());
        using var resolvePeer = await client.SendWithTokenAsync(HttpMethod.Post, resolvePath, peerToken, validResolution);
        Assert.Equal(HttpStatusCode.NotFound, resolvePeer.StatusCode);
        using var resolveWrong = await client.SendWithTokenAsync(HttpMethod.Post, resolvePath, ownerToken,
            new { expectedVersion = issueVersion, scannedBarcode = "HANDOVER-1", resolution = "Replaced the container" });
        Assert.Equal("issue_handover_barcode_mismatch", await resolveWrong.ReadErrorCodeAsync());
        using var resolve = await client.SendWithTokenAsync(HttpMethod.Post, resolvePath, ownerToken, validResolution);
        Assert.Equal("RESOLVED", (await ReadAsync(resolve)).GetProperty("status").GetString());

        if (robotButton)
        {
            var armed = Assert.Single(mqtt.PublishedInteractionRequests, item => item.JobId == job.Id && item.HandoverStop is not null);
            Assert.Equal(2, armed.HandoverStop!.ContainerIds!.Count);
            var click = new RobotInteractionConfirmMessage
            {
                RobotCode = robot.Code, JobId = job.Id, JobStepId = armed.JobStepId, ContainerId = armed.ContainerId,
                EndpointId = endpoint, InteractionType = armed.InteractionType, MessageId = Guid.NewGuid(),
                RequestMessageId = armed.MessageId, HandoverStop = armed.HandoverStop with { ContainerIds = null }
            };
            settings.EnableHandoverStopButton = true;
            try
            {
                var staleId = Guid.NewGuid();
                click.RequestMessageId = staleId;
                await SendButtonAsync(click);
                Assert.Contains(mqtt.PublishedInteractionResults, result => result.ConfirmMessageId == click.MessageId
                    && !result.Accepted && result.ReasonCode == "interaction_arm_changed");
                click.RequestMessageId = armed.MessageId;
                await SendButtonAsync(click);
                await SendButtonAsync(click);
                Assert.Equal(2, mqtt.PublishedInteractionResults.Count(result => result.ConfirmMessageId == click.MessageId && result.Accepted));
            }
            finally
            {
                settings.EnableHandoverStopButton = oldButtonSetting;
            }
        }
        else
        {
            var responses = await Task.WhenAll(Enumerable.Range(0, 2)
                .Select(_ => client.SendWithTokenAsync(HttpMethod.Post, $"{path}/confirm", ownerToken, confirmation)));
            try
            {
                var payloads = await Task.WhenAll(responses.Select(ReadAsync));
                Assert.All(payloads, detail => Assert.Equal(job.Id, detail.GetProperty("id").GetGuid()));
            }
            finally
            {
                foreach (var response in responses) response.Dispose();
            }
        }
        var confirmations = await db.HandoverConfirmations.AsNoTracking().ToListAsync();
        Assert.Equal(2, confirmations.Count);
        Assert.All(confirmations, record =>
        {
            Assert.Equal(robotButton ? null : (Guid?)owner.Id, record.ConfirmedBy);
            Assert.Equal(robotButton ? ConfirmationSource.ROBOT_BUTTON : ConfirmationSource.STAFF_APP, record.ConfirmationSource);
            if (robotButton) Assert.Equal(robot.Id, record.ConfirmedByRobotId);
            else Assert.NotNull(record.Evidence);
        });
        Assert.All(await db.JobContainers.AsNoTracking().ToListAsync(), container => Assert.Equal(JobContainerStatus.ONBOARD, container.Status));

        async Task SendButtonAsync(RobotInteractionConfirmMessage click)
        {
            await using var messageScope = Factory.Services.CreateAsyncScope();
            var handler = messageScope.ServiceProvider.GetRequiredService<ProcessRobotInteractionConfirmHandler>();
            await handler.HandleAsync(click, default);
        }
    }

    [Fact]
    public async Task A_work_zone_gets_first_claim_and_the_offer_then_opens_to_the_warehouse()
    {
        var nearby = await Factory.CreateAccountAsync("nearby", AccountRole.STAFF);
        var elsewhere = await Factory.CreateAccountAsync("elsewhere", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var nearbyToken = (await client.LoginAsync(nearby.Username)).AccessToken;
        var elsewhereToken = (await client.LoginAsync(elsewhere.Username)).AccessToken;
        var (job, stop, move, _, moveId) = await SeedAsync(nearby.Id);
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var navigation = scope.ServiceProvider.GetRequiredService<NavigationDbContext>();
        var settings = scope.ServiceProvider.GetRequiredService<IOptions<HumanTaskOptions>>().Value;
        var oldPriority = settings.StopWorkZonePrioritySeconds;
        settings.StopWorkZonePrioritySeconds = 120;
        try
        {
            var zone = new Zone
            {
                Id = Guid.NewGuid(), MapVersionId = job.MapVersionId, Name = "Picking", Code = "ZONE-AREA-PICKING",
                ZoneType = ZoneType.SPEED, IsActive = true,
                Geometry = JsonDocument.Parse("""{"type":"Polygon","coordinates":[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}""")
            };
            navigation.AddRange(zone, new Endpoint
            {
                Id = move.TargetEndpointId!.Value, MapVersionId = job.MapVersionId, Name = "Pick", Code = "WAYPOINT-PICK",
                IsEnabled = true, X = 1, Y = 1
            });
            await navigation.SaveChangesAsync();
            using var selected = await client.SendWithTokenAsync(HttpMethod.Put,
                "/api/workflow-execution/handover-stops/work-zone", nearbyToken, new { zoneId = zone.Id });
            Assert.Equal(zone.Code, (await ReadAsync(selected)).GetProperty("workZone").GetProperty("code").GetString());

            var storedMove = (await db.JobSteps.FindAsync(move.Id))!;
            storedMove.AcceptedMoveCommandId = moveId;
            storedMove.MoveAcceptedAt = DateTimeOffset.UtcNow.AddSeconds(-11);
            await db.SaveChangesAsync();
            var path = $"/api/workflow-execution/jobs/{job.Id}/handover-stops/{stop.Id}";
            using var tooEarly = await client.SendWithTokenAsync(HttpMethod.Post, $"{path}/claim", elsewhereToken, new { moveId, version = 0 });
            Assert.Equal("handover_work_zone_priority", await tooEarly.ReadErrorCodeAsync());
            const string offers = "/api/operations/notifications?kind=HANDOVER_STOP_OFFERED&take=100";
            using var untilNotice = new CancellationTokenSource(TimeSpan.FromSeconds(8));
            while (true)
            {
                using var response = await client.GetWithTokenAsync(offers, nearbyToken);
                if ((await ReadAsync(response)).GetProperty("items").GetArrayLength() > 0) break;
                await Task.Delay(100, untilNotice.Token);
            }
            using var foreignNotice = await client.GetWithTokenAsync(offers, elsewhereToken);
            Assert.Empty((await ReadAsync(foreignNotice)).GetProperty("items").EnumerateArray());

            storedMove.MoveAcceptedAt = DateTimeOffset.UtcNow.AddSeconds(-131);
            await db.SaveChangesAsync();
            using var claim = await client.SendWithTokenAsync(HttpMethod.Post, $"{path}/claim", elsewhereToken, new { moveId, version = 0 });
            var version = (await ReadAsync(claim)).GetProperty("version").GetInt32();
            using var heartbeat = await client.SendWithTokenAsync(HttpMethod.Post, $"{path}/heartbeat", elsewhereToken, new { moveId, version });
            Assert.Equal(version, (await ReadAsync(heartbeat)).GetProperty("version").GetInt32());

            var savedStop = (await db.JobTasks.FindAsync(stop.Id))!;
            savedStop.HandoverHeartbeatAt = DateTimeOffset.UtcNow.AddMinutes(-2);
            await db.SaveChangesAsync();
            using var reclaimed = await client.SendWithTokenAsync(HttpMethod.Post, $"{path}/claim", nearbyToken, new { moveId, version });
            Assert.Equal(nearby.Id, (await ReadAsync(reclaimed)).GetProperty("claimedBy").GetGuid());
        }
        finally
        {
            settings.StopWorkZonePrioritySeconds = oldPriority;
        }
    }

    private static async Task<JsonElement> ReadAsync(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static DateTimeOffset? OptionalTime(JsonElement response, string key) =>
        response.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetDateTimeOffset() : null;

    private async Task<(Job Job, JobTask Stop, JobStep Move, JobStep Handover, Guid MoveId)> SeedAsync(Guid actor)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var warehousing = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var navigation = scope.ServiceProvider.GetRequiredService<NavigationDbContext>();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var now = DateTimeOffset.UtcNow;
        var warehouse = new WarehouseEntity { Id = Guid.NewGuid(), Code = "FLOOR", Name = "Floor", IsActive = true, CreatedAt = now };
        warehousing.Warehouses.Add(warehouse);
        await warehousing.SaveChangesAsync();
        var map = new MapVersion
        {
            Id = Guid.NewGuid(), WarehouseId = warehouse.Id, Code = "MAP-FLOOR", Name = "Floor", VersionNo = 1,
            Status = MapStatus.PUBLISHED, CreatedAt = now, PublishedAt = now
        };
        navigation.MapVersions.Add(map);
        await navigation.SaveChangesAsync();
        var workflow = new Workflow
        {
            Id = Guid.NewGuid(), Code = "HANDOVER-TEST", Name = "Handover", VersionNo = 1,
            Status = WorkflowStatus.PUBLISHED, CreatedBy = actor, CreatedAt = now
        };
        var template = new WorkflowTask { Id = Guid.NewGuid(), WorkflowId = workflow.Id, TaskKey = "PICK", Name = "Pick", SequenceNo = 1 };
        var moveDefinition = new WorkflowStep
        {
            Id = Guid.NewGuid(), WorkflowTaskId = template.Id, StepKey = "MOVE", Name = "Move", SequenceNo = 1, StepType = StepType.MOVE
        };
        var handoverDefinition = new WorkflowStep
        {
            Id = Guid.NewGuid(), WorkflowTaskId = template.Id, StepKey = "HANDOVER", Name = "Handover", SequenceNo = 2,
            StepType = StepType.HUMAN_INTERACTION, Config = new() { OperationCode = "PICKUP_CONFIRM" }
        };
        execution.AddRange(workflow, template, moveDefinition, handoverDefinition);
        var job = new Job
        {
            Id = Guid.NewGuid(), JobNo = "JOB-HANDOVER", ProvisioningKey = "JOB-HANDOVER", WorkflowId = workflow.Id,
            MapVersionId = map.Id, Status = JobStatus.RUNNING, StartedAt = now, CreatedAt = now
        };
        var endpoint = Guid.NewGuid();
        var container = Guid.NewGuid();
        var stop = new JobTask
        {
            Id = Guid.NewGuid(), JobId = job.Id, WorkflowTaskId = template.Id, SequenceNo = 1, Status = JobTaskStatus.RUNNING,
            ContextValues = JobTaskContextBuilder.BuildStopScope(new(1, endpoint, JobStopAction.PICKUP, [container]), [])
        };
        var moveId = Guid.NewGuid();
        var move = new JobStep
        {
            Id = Guid.NewGuid(), JobTaskId = stop.Id, WorkflowStepId = moveDefinition.Id, SequenceNo = 1, StepType = StepType.MOVE,
            Status = JobStepStatus.EXECUTING, TargetEndpointId = endpoint,
            OutputValues = new() { ["robotCommandId"] = JsonSerializer.SerializeToElement(moveId) }
        };
        var work = new JobTask
        {
            Id = Guid.NewGuid(), JobId = job.Id, WorkflowTaskId = template.Id, SequenceNo = 2, Status = JobTaskStatus.PENDING,
            ContextValues = new() { ["stopSequenceNo"] = JsonSerializer.SerializeToElement(1), ["containerId"] = JsonSerializer.SerializeToElement(container) }
        };
        var handover = new JobStep
        {
            Id = Guid.NewGuid(), JobTaskId = work.Id, WorkflowStepId = handoverDefinition.Id, SequenceNo = 1,
            StepType = StepType.HUMAN_INTERACTION, Status = JobStepStatus.PENDING, TargetEndpointId = endpoint
        };
        execution.AddRange(job, stop, move, work, handover);
        await execution.SaveChangesAsync();
        return (job, stop, move, handover, moveId);
    }
}

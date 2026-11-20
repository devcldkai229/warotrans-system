using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
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
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Services;
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

    private static async Task<JsonElement> ReadAsync(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
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

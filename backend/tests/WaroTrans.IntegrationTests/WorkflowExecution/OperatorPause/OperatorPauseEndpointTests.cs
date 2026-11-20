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
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WarehouseEntity = WaroTrans.Warehouse.Entities.Warehouse;

namespace WaroTrans.IntegrationTests.WorkflowExecution.OperatorPause;

[Collection(IntegrationCollection.Name)]
public sealed class OperatorPauseEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task The_shared_staff_warehouse_also_limits_handover_and_recovery()
    {
        await Factory.CreateAccountAsync("staff-floor", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync("staff-floor")).AccessToken;
        var (jobId, foreignJobId) = await SeedJobsAsync();
        var foreign = $"/api/workflow-execution/jobs/{foreignJobId}";

        using var recovery = await client.GetWithTokenAsync($"{foreign}/recovery", token);
        Assert.Equal(HttpStatusCode.Forbidden, recovery.StatusCode);
        Assert.Equal("job_outside_staff_warehouse", await recovery.ReadErrorCodeAsync());

        using var handover = await client.SendWithTokenAsync(HttpMethod.Post, $"{foreign}/handover/confirm-batch", token,
            new { type = "PICKUP", containerIds = new[] { Guid.NewGuid() } });
        Assert.Equal(HttpStatusCode.Forbidden, handover.StatusCode);
        Assert.Equal("job_outside_staff_warehouse", await handover.ReadErrorCodeAsync());

        using var sharedRecovery = await client.GetWithTokenAsync($"/api/workflow-execution/jobs/{jobId}/recovery", token);
        Assert.Equal(HttpStatusCode.OK, sharedRecovery.StatusCode);
    }

    [Fact]
    public async Task Staff_pause_in_the_shared_warehouse_and_only_the_owner_or_admin_can_request_resume()
    {
        var owner = await Factory.CreateAccountAsync("pause-owner", AccountRole.STAFF);
        await Factory.CreateAccountAsync("pause-colleague", AccountRole.STAFF);
        await Factory.CreateAccountAsync("pause-admin", AccountRole.ADMIN);
        var client = CreateAnonymousClient();
        var ownerToken = (await client.LoginAsync("pause-owner")).AccessToken;
        var colleagueToken = (await client.LoginAsync("pause-colleague")).AccessToken;
        var adminToken = (await client.LoginAsync("pause-admin")).AccessToken;
        var (jobId, foreignJobId) = await SeedJobsAsync();
        var job = $"/api/workflow-execution/jobs/{jobId}";

        using var wrongWarehouse = await client.SendWithTokenAsync(HttpMethod.Post,
            $"/api/workflow-execution/jobs/{foreignJobId}/pause", ownerToken, new { reason = "Aisle blocked" });
        Assert.Equal(HttpStatusCode.Forbidden, wrongWarehouse.StatusCode);
        Assert.Equal("job_outside_staff_warehouse", await wrongWarehouse.ReadErrorCodeAsync());

        using var blankReason = await client.SendWithTokenAsync(HttpMethod.Post, $"{job}/pause", ownerToken, new { reason = " " });
        Assert.Equal(HttpStatusCode.BadRequest, blankReason.StatusCode);
        Assert.Equal("job_pause_reason_required", await blankReason.ReadErrorCodeAsync());

        using var paused = await client.SendWithTokenAsync(HttpMethod.Post, $"{job}/pause", ownerToken, new { reason = "Aisle blocked" });
        Assert.Equal(HttpStatusCode.OK, paused.StatusCode);
        var body = await paused.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("PAUSED", body.GetProperty("status").GetString());
        var pause = body.GetProperty("operatorPause");
        Assert.Equal(owner.Id, pause.GetProperty("pausedBy").GetGuid());
        Assert.Equal("Aisle blocked", pause.GetProperty("reason").GetString());
        Assert.True(ResumeAction(body).GetProperty("allowed").GetBoolean());

        using var detail = await client.GetWithTokenAsync(job, colleagueToken);
        detail.EnsureSuccessStatusCode();
        var colleagueAction = ResumeAction(await detail.Content.ReadFromJsonAsync<JsonElement>());
        Assert.False(colleagueAction.GetProperty("allowed").GetBoolean());
        Assert.Equal("job_pause_owner_required", colleagueAction.GetProperty("reason").GetString());

        using var colleagueResume = await client.SendWithTokenAsync(HttpMethod.Post, $"{job}/resume", colleagueToken, new { });
        Assert.Equal(HttpStatusCode.Forbidden, colleagueResume.StatusCode);
        Assert.Equal("job_pause_owner_required", await colleagueResume.ReadErrorCodeAsync());

        // The job has no assigned robot, so authorized callers reach the readiness checks.
        using var ownerResume = await client.SendWithTokenAsync(HttpMethod.Post, $"{job}/resume", ownerToken, new { });
        using var adminResume = await client.SendWithTokenAsync(HttpMethod.Post, $"{job}/resume", adminToken, new { });
        Assert.Equal("robot_required", await ownerResume.ReadErrorCodeAsync());
        Assert.Equal("robot_required", await adminResume.ReadErrorCodeAsync());
    }

    private static JsonElement ResumeAction(JsonElement detail) => detail.GetProperty("availableActions").EnumerateArray()
        .Single(action => action.GetProperty("action").GetString() == "RESUME");

    private async Task<(Guid JobId, Guid ForeignJobId)> SeedJobsAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var warehouse = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
        var navigation = scope.ServiceProvider.GetRequiredService<NavigationDbContext>();
        var jobs = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var now = DateTimeOffset.UtcNow;
        var shared = Guid.NewGuid();
        var foreign = Guid.NewGuid();
        warehouse.Warehouses.AddRange(
            new WarehouseEntity { Id = shared, Code = "SHARED", Name = "Shared", IsActive = true, CreatedAt = now },
            new WarehouseEntity { Id = foreign, Code = "OTHER", Name = "Other", IsActive = true, CreatedAt = now });
        await warehouse.SaveChangesAsync();

        var present = new MapVersion
        {
            Id = Guid.NewGuid(), WarehouseId = shared, Code = "SHARED-V2", Name = "Shared V2", VersionNo = 2,
            Status = MapStatus.PUBLISHED, CreatedAt = now, PublishedAt = now
        };
        var prior = new MapVersion
        {
            Id = Guid.NewGuid(), WarehouseId = shared, Code = "SHARED-V1", Name = "Shared V1", VersionNo = 1,
            Status = MapStatus.ARCHIVED, CreatedAt = now.AddDays(-2), PublishedAt = now.AddDays(-2)
        };
        var earlier = new MapVersion
        {
            Id = Guid.NewGuid(), WarehouseId = foreign, Code = "OTHER-V1", Name = "Other V1", VersionNo = 1,
            Status = MapStatus.PUBLISHED, CreatedAt = now.AddDays(-1), PublishedAt = now.AddDays(-1)
        };
        navigation.MapVersions.AddRange(present, prior, earlier);
        await navigation.SaveChangesAsync();

        var ownJob = CreateJob(prior.Id, "JOB-SHARED", now);
        var otherJob = CreateJob(earlier.Id, "JOB-OTHER", now);
        jobs.Jobs.AddRange(ownJob, otherJob);
        await jobs.SaveChangesAsync();
        return (ownJob.Id, otherJob.Id);
    }

    private static Job CreateJob(Guid mapVersionId, string code, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(), JobNo = code, ProvisioningKey = code, WorkflowId = Guid.NewGuid(),
        MapVersionId = mapVersionId, Status = JobStatus.RUNNING, CreatedAt = now, StartedAt = now
    };
}

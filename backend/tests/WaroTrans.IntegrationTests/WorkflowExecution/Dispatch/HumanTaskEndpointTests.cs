using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.IntegrationTests.Transportation;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.IntegrationTests.WorkflowExecution.Dispatch;

/// <summary>WH-03 over HTTP and the real database: claiming, who may do what, the concurrency token.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class HumanTaskEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Root = "/api/workflow-execution";

    /// <summary>A running Job whose first step is a waiting human step (the scenario's map has no traffic graph).</summary>
    private async Task<(Guid JobId, Guid StepId)> WaitingStepAsync()
    {
        var seed = await TransportRequestScenario.SeedAsync(Factory.Services, Client, "CTN-" + Guid.NewGuid().ToString("N")[..8]);
        var workflowId = await TransportRequestScenario.CreatePublishedWorkflowAsync(Client);
        var requestId = await TransportRequestScenario.SubmitAsync(Client, seed, workflowId);
        var queued = await (await Client.PostAsync($"/api/transportation/transport-requests/{requestId}/queue", null))
            .Content.ReadFromJsonAsync<JsonElement>();
        var jobId = queued.GetProperty("jobs")[0].GetProperty("jobId").GetGuid();

        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var job = await db.Jobs.Include(j => j.JobTasks).ThenInclude(t => t.JobSteps).SingleAsync(j => j.Id == jobId);
        job.Status = JobStatus.RUNNING;
        var step = job.JobTasks.OrderBy(t => t.SequenceNo).SelectMany(t => t.JobSteps.OrderBy(s => s.SequenceNo)).First();
        step.StepType = StepType.HUMAN_INTERACTION;
        step.Status = JobStepStatus.WAITING;
        step.StartedAt = DateTimeOffset.UtcNow;
        step.DeadlineAt = DateTimeOffset.UtcNow.AddMinutes(5);
        await db.SaveChangesAsync();
        return (jobId, step.Id);
    }

    private async Task<(HttpClient Client, string Token)> SignInAsync(string name, AccountRole role)
    {
        await Factory.CreateAccountAsync(name, role);
        var client = CreateAnonymousClient();
        return (client, (await client.LoginAsync(name)).AccessToken);
    }

    [Fact]
    public async Task Two_staff_racing_for_a_step_leave_one_holder()
    {
        var (_, stepId) = await WaitingStepAsync();
        var (a, tokenA) = await SignInAsync("claim_a", AccountRole.STAFF);
        var (b, tokenB) = await SignInAsync("claim_b", AccountRole.STAFF);

        var responses = await Task.WhenAll(
            a.SendWithTokenAsync(HttpMethod.Post, $"{Root}/job-steps/{stepId}/claim", tokenA, new { }),
            b.SendWithTokenAsync(HttpMethod.Post, $"{Root}/job-steps/{stepId}/claim", tokenB, new { }));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        var loser = Assert.Single(responses, r => r.StatusCode != HttpStatusCode.OK);
        Assert.Equal(HttpStatusCode.Conflict, loser.StatusCode);
        Assert.Equal("human_task_claimed", await loser.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task The_task_list_shows_who_holds_a_step_and_the_holder_can_give_it_back()
    {
        var (jobId, stepId) = await WaitingStepAsync();
        var (a, tokenA) = await SignInAsync("list_a", AccountRole.STAFF);
        var (b, tokenB) = await SignInAsync("list_b", AccountRole.STAFF);
        Assert.Equal(HttpStatusCode.OK, (await a.SendWithTokenAsync(HttpMethod.Post, $"{Root}/job-steps/{stepId}/claim", tokenA, new { })).StatusCode);

        var list = await (await b.GetWithTokenAsync($"{Root}/human-tasks", tokenB)).Content.ReadFromJsonAsync<JsonElement>();
        var task = Assert.Single(list.GetProperty("items").EnumerateArray(), t => t.GetProperty("jobStepId").GetGuid() == stepId);
        Assert.Equal(jobId, task.GetProperty("jobId").GetGuid());
        Assert.False(string.IsNullOrEmpty(task.GetProperty("claimedByName").GetString()));
        Assert.False(task.GetProperty("overdue").GetBoolean());

        var mineForB = await (await b.GetWithTokenAsync($"{Root}/human-tasks?mine=true", tokenB)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Empty(mineForB.GetProperty("items").EnumerateArray());

        var notYours = await b.SendWithTokenAsync(HttpMethod.Post, $"{Root}/job-steps/{stepId}/release", tokenB, new { });
        Assert.Equal("human_task_not_yours", await notYours.ReadErrorCodeAsync());

        Assert.Equal(HttpStatusCode.OK, (await a.SendWithTokenAsync(HttpMethod.Post, $"{Root}/job-steps/{stepId}/release", tokenA, new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await b.SendWithTokenAsync(HttpMethod.Post, $"{Root}/job-steps/{stepId}/claim", tokenB, new { })).StatusCode);
    }

    [Fact]
    public async Task Only_an_admin_takes_over_and_only_with_a_reason()
    {
        var (jobId, stepId) = await WaitingStepAsync();
        var (a, tokenA) = await SignInAsync("over_a", AccountRole.STAFF);
        var (b, tokenB) = await SignInAsync("over_b", AccountRole.STAFF);
        Assert.Equal(HttpStatusCode.OK, (await a.SendWithTokenAsync(HttpMethod.Post, $"{Root}/job-steps/{stepId}/claim", tokenA, new { })).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await b.SendWithTokenAsync(HttpMethod.Post, $"{Root}/job-steps/{stepId}/takeover", tokenB, new { reason = "mine now" })).StatusCode);
        var noReason = await Client.PostAsJsonAsync($"{Root}/job-steps/{stepId}/takeover", new { reason = " " });
        Assert.Equal("takeover_reason_required", await noReason.ReadErrorCodeAsync());

        var taken = await Client.PostAsJsonAsync($"{Root}/job-steps/{stepId}/takeover", new { reason = "A went home" });
        Assert.Equal(HttpStatusCode.OK, taken.StatusCode);

        var detail = await Client.GetFromJsonAsync<JsonElement>($"{Root}/jobs/{jobId}");
        var step = detail.GetProperty("tasks").EnumerateArray().SelectMany(t => t.GetProperty("steps").EnumerateArray())
            .Single(s => s.GetProperty("id").GetGuid() == stepId);
        Assert.NotEqual(JsonValueKind.Null, step.GetProperty("claimedBy").ValueKind);
        var refused = await a.SendWithTokenAsync(HttpMethod.Post, $"{Root}/job-steps/{stepId}/claim", tokenA, new { });
        Assert.Equal("human_task_claimed", await refused.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task A_technician_cannot_claim_or_confirm_handovers()
    {
        var (jobId, stepId) = await WaitingStepAsync();
        var (tech, token) = await SignInAsync("claim_tech", AccountRole.TECHNICIAN);

        Assert.Equal(HttpStatusCode.Forbidden, (await tech.SendWithTokenAsync(HttpMethod.Post, $"{Root}/job-steps/{stepId}/claim", token, new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await tech.GetWithTokenAsync($"{Root}/human-tasks", token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await tech.SendWithTokenAsync(HttpMethod.Post, $"{Root}/jobs/{jobId}/handover/confirm-batch", token, new { type = "PICKUP", containerIds = new[] { Guid.NewGuid() } })).StatusCode);
    }

    [Fact]
    public async Task Confirm_all_refuses_a_request_that_names_nothing()
    {
        var (jobId, _) = await WaitingStepAsync();

        var noType = await Client.PostAsJsonAsync($"{Root}/jobs/{jobId}/handover/confirm-batch", new { containerIds = new[] { Guid.NewGuid() } });
        Assert.Equal("handover_type_required", await noType.ReadErrorCodeAsync());
        var none = await Client.PostAsJsonAsync($"{Root}/jobs/{jobId}/handover/confirm-batch", new { type = "PICKUP", containerIds = Array.Empty<Guid>() });
        Assert.Equal("container_ids_required", await none.ReadErrorCodeAsync());
    }
}

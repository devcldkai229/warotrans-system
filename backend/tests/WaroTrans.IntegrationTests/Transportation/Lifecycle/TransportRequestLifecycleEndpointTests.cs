using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.IntegrationTests.Transportation.Lifecycle;

/// <summary>TRN-01 cancel, TRN-02 reject, WH-04 warehouse untouched before pickup, BOTH-04 availableActions.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class TransportRequestLifecycleEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Route = "/api/transportation/transport-requests";

    private async Task<(Guid RequestId, TransportRequestScenario.Seed Seed)> SubmitAsync()
    {
        var seed = await TransportRequestScenario.SeedAsync(Factory.Services, Client, "CTN-" + Guid.NewGuid().ToString("N")[..8]);
        var workflowId = await TransportRequestScenario.CreatePublishedWorkflowAsync(Client);
        return (await TransportRequestScenario.SubmitAsync(Client, seed, workflowId), seed);
    }

    private async Task<JsonElement> GetAsync(Guid id) => await Client.GetFromJsonAsync<JsonElement>($"{Route}/{id}");

    private static bool Allowed(JsonElement request, string action) =>
        request.GetProperty("availableActions").EnumerateArray().Single(a => a.GetProperty("action").GetString() == action)
            .GetProperty("allowed").GetBoolean();

    private async Task<List<JobStatus>> JobStatusesAsync(Guid requestId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        return await db.JobContainers.Where(c => c.TransportRequestId == requestId).Select(c => c.Job.Status).Distinct().ToListAsync();
    }

    [Fact]
    public async Task Cancelling_a_submitted_request_closes_it_once_and_records_why()
    {
        var (id, _) = await SubmitAsync();
        Assert.True(Allowed(await GetAsync(id), "CANCEL"));

        var cancel = await Client.PostAsJsonAsync($"{Route}/{id}/cancel", new { reason = "entered twice" });
        Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);
        var body = await cancel.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("CANCELLED", body.GetProperty("status").GetString());
        Assert.Equal("entered twice", body.GetProperty("cancelReason").GetString());
        Assert.All(body.GetProperty("details").EnumerateArray(), d => Assert.Equal("CANCELLED", d.GetProperty("status").GetString()));
        Assert.False(Allowed(body, "CANCEL"));

        // Repeating the cancel changes nothing and does not fail.
        var again = await Client.PostAsJsonAsync($"{Route}/{id}/cancel", new { reason = "second click" });
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal("entered twice", (await again.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("cancelReason").GetString());
    }

    [Fact]
    public async Task Cancel_needs_a_reason_and_the_permission()
    {
        var (id, _) = await SubmitAsync();

        var noReason = await Client.PostAsJsonAsync($"{Route}/{id}/cancel", new { });
        Assert.Equal(HttpStatusCode.BadRequest, noReason.StatusCode);
        Assert.Equal("reason_required", await noReason.ReadErrorCodeAsync());

        await Factory.CreateAccountAsync("stan", AccountRole.STAFF);
        var staffClient = CreateAnonymousClient();
        var staff = await staffClient.LoginAsync("stan");
        var forbidden = await staffClient.SendWithTokenAsync(HttpMethod.Post, $"{Route}/{id}/cancel", staff.AccessToken, new { reason = "x" });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        // Staff are told the same thing before they click.
        var seen = await (await staffClient.SendWithTokenAsync(HttpMethod.Get, $"{Route}/{id}", staff.AccessToken)).Content.ReadFromJsonAsync<JsonElement>();
        var cancelAction = seen.GetProperty("availableActions").EnumerateArray().Single(a => a.GetProperty("action").GetString() == "CANCEL");
        Assert.Equal("forbidden", cancelAction.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Cancelling_a_queued_request_cancels_its_jobs_and_leaves_the_warehouse_alone()
    {
        var (id, seed) = await SubmitAsync();
        (await Client.PostAsync($"{Route}/{id}/queue", null)).EnsureSuccessStatusCode();

        var cancel = await Client.PostAsJsonAsync($"{Route}/{id}/cancel", new { reason = "customer cancelled" });

        Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);
        Assert.Equal("CANCELLED", (await cancel.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
        Assert.Equal([JobStatus.CANCELLED], await JobStatusesAsync(id));

        await using var scope = Factory.Services.CreateAsyncScope();
        var container = await scope.ServiceProvider.GetRequiredService<WarehouseDbContext>().Containers.SingleAsync(c => c.Id == seed.ContainerId);
        Assert.Equal(ContainerStatus.STORED, container.Status);
        Assert.Equal(seed.SourceLocationId, container.CurrentStorageLocationId);
    }

    [Fact]
    public async Task Rejecting_records_the_reviewer_and_closes_the_request()
    {
        var (id, _) = await SubmitAsync();

        var reject = await Client.PostAsJsonAsync($"{Route}/{id}/reject", new { reason = "destination is full" });

        Assert.Equal(HttpStatusCode.OK, reject.StatusCode);
        var body = await reject.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("REJECTED", body.GetProperty("status").GetString());
        Assert.Equal("destination is full", body.GetProperty("rejectReason").GetString());
        Assert.NotEqual(JsonValueKind.Null, body.GetProperty("rejectedBy").ValueKind);
        Assert.Empty(await JobStatusesAsync(id)); // never provisioned

        var queue = await Client.PostAsync($"{Route}/{id}/queue", null);
        Assert.Equal(HttpStatusCode.Conflict, queue.StatusCode);
        var cancel = await Client.PostAsJsonAsync($"{Route}/{id}/cancel", new { reason = "x" });
        Assert.Equal("transport_request_closed", await cancel.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task A_queued_request_can_be_rejected_until_one_of_its_jobs_runs()
    {
        var (id, _) = await SubmitAsync();
        (await Client.PostAsync($"{Route}/{id}/queue", null)).EnsureSuccessStatusCode();
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            var job = await db.JobContainers.Where(c => c.TransportRequestId == id).Select(c => c.Job).FirstAsync();
            job.Status = JobStatus.RUNNING;
            await db.SaveChangesAsync();
        }

        Assert.False(Allowed(await GetAsync(id), "REJECT"));
        var reject = await Client.PostAsJsonAsync($"{Route}/{id}/reject", new { reason = "too late" });
        Assert.Equal(HttpStatusCode.Conflict, reject.StatusCode);
        Assert.Equal("transport_request_already_running", await reject.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task A_queued_request_whose_jobs_never_ran_is_rejected_with_its_jobs()
    {
        var (id, _) = await SubmitAsync();
        (await Client.PostAsync($"{Route}/{id}/queue", null)).EnsureSuccessStatusCode();

        var reject = await Client.PostAsJsonAsync($"{Route}/{id}/reject", new { reason = "wrong workflow" });

        Assert.Equal(HttpStatusCode.OK, reject.StatusCode);
        Assert.Equal("REJECTED", (await GetAsync(id)).GetProperty("status").GetString());
        Assert.Equal([JobStatus.CANCELLED], await JobStatusesAsync(id));
    }
}

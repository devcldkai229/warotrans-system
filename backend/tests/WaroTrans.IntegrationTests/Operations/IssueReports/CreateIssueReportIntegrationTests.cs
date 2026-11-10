using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.IntegrationTests.Operations.IssueReports;

/// <summary>OPS-01 IssueReport lifecycle and WFX-05 step-raised issues, through real tokens.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class CreateIssueReportIntegrationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private const string Issues = "/api/operations/issues";

    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();
        await using var scope = Factory.Services.CreateAsyncScope();
        var mongo = scope.ServiceProvider.GetRequiredService<OperationsMongoContext>();
        await mongo.IssueReports.DeleteManyAsync(FilterDefinition<IssueReport>.Empty);
        await mongo.Notifications.DeleteManyAsync(FilterDefinition<Notification>.Empty);
        await mongo.AuditLogs.DeleteManyAsync(FilterDefinition<AuditLog>.Empty);
    }

    private async Task<(HttpClient Client, SessionDto Session)> SignInAsync(string username, AccountRole role)
    {
        await Factory.CreateAccountAsync(username, role);
        var client = CreateAnonymousClient();
        return (client, await client.LoginAsync(username));
    }

    private static object NewIssue(string description = "Pallet strap broken") =>
        new { issueType = "CONTAINER", severity = "HIGH", description, evidence = new[] { new { kind = "NOTE", note = "seen at dock 1" } } };

    private static async Task<JsonElement> BodyAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();

    [Fact]
    public async Task Post_issue_report_persists_mongo_document()
    {
        var (client, staff) = await SignInAsync("sam", AccountRole.STAFF);

        var response = await client.SendWithTokenAsync(HttpMethod.Post, Issues, staff.AccessToken, NewIssue());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await BodyAsync(response);
        Assert.Equal("OPEN", body.GetProperty("status").GetString());
        Assert.Equal(1, body.GetProperty("version").GetInt32());
        Assert.StartsWith("ISS-", body.GetProperty("code").GetString());
        Assert.Equal(staff.Account.Id, body.GetProperty("reportedBy").GetGuid());

        await using var scope = Factory.Services.CreateAsyncScope();
        var stored = await scope.ServiceProvider.GetRequiredService<OperationsMongoContext>().IssueReports
            .Find(i => i.Id == body.GetProperty("id").GetGuid()).SingleAsync();
        Assert.Single(stored.Evidence);
        Assert.Equal(staff.Account.Id, stored.Evidence[0].AddedBy);
    }

    [Fact]
    public async Task Staff_only_see_their_own_issues()
    {
        var (client, sam) = await SignInAsync("sam", AccountRole.STAFF);
        var bob = await client.LoginAsync((await Factory.CreateAccountAsync("bob", AccountRole.STAFF)).Username);
        var created = await BodyAsync(await client.SendWithTokenAsync(HttpMethod.Post, Issues, sam.AccessToken, NewIssue()));
        var id = created.GetProperty("id").GetGuid();

        var asBob = await client.GetWithTokenAsync($"{Issues}/{id}", bob.AccessToken);
        var bobsList = await BodyAsync(await client.GetWithTokenAsync(Issues, bob.AccessToken));

        Assert.Equal(HttpStatusCode.NotFound, asBob.StatusCode);
        Assert.Equal(0, bobsList.GetProperty("total").GetInt64());
        Assert.Equal(HttpStatusCode.OK, (await client.GetWithTokenAsync($"{Issues}/{id}", sam.AccessToken)).StatusCode);
    }

    [Fact]
    public async Task Admin_moves_the_issue_through_its_lifecycle_with_version_checks()
    {
        var (client, sam) = await SignInAsync("sam", AccountRole.STAFF);
        var admin = await client.LoginAsync((await Factory.CreateAccountAsync("boss", AccountRole.ADMIN)).Username);
        var id = (await BodyAsync(await client.SendWithTokenAsync(HttpMethod.Post, Issues, sam.AccessToken, NewIssue())))
            .GetProperty("id").GetGuid();

        var staffMove = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Issues}/{id}/transition", sam.AccessToken, new { status = "ACKNOWLEDGED", expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.Forbidden, staffMove.StatusCode);

        var ack = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Issues}/{id}/transition", admin.AccessToken, new { status = "ACKNOWLEDGED", expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.OK, ack.StatusCode);
        Assert.Equal(2, (await BodyAsync(ack)).GetProperty("version").GetInt32());

        var stale = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Issues}/{id}/transition", admin.AccessToken, new { status = "IN_PROGRESS", expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("issue_version_conflict", await stale.ReadErrorCodeAsync());

        var noResolution = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Issues}/{id}/transition", admin.AccessToken, new { status = "RESOLVED", expectedVersion = 2 });
        Assert.Equal(HttpStatusCode.BadRequest, noResolution.StatusCode);

        var resolved = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Issues}/{id}/transition", admin.AccessToken,
            new { status = "RESOLVED", expectedVersion = 2, resolution = "Re-strapped" });
        Assert.Equal(HttpStatusCode.OK, resolved.StatusCode);
        Assert.Equal(admin.Account.Id, (await BodyAsync(resolved)).GetProperty("resolvedBy").GetGuid());

        var closed = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Issues}/{id}/transition", admin.AccessToken, new { status = "CLOSED", expectedVersion = 3 });
        Assert.Equal(HttpStatusCode.OK, closed.StatusCode);

        var reopen = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Issues}/{id}/transition", admin.AccessToken, new { status = "IN_PROGRESS", expectedVersion = 4 });
        Assert.Equal(HttpStatusCode.Conflict, reopen.StatusCode);
        Assert.Equal("issue_transition_not_allowed", await reopen.ReadErrorCodeAsync());

        // The reporter is told it was resolved, in their own inbox.
        var inbox = await BodyAsync(await client.GetWithTokenAsync("/api/operations/notifications", sam.AccessToken));
        Assert.Contains(inbox.GetProperty("items").EnumerateArray(), n => n.GetProperty("kind").GetString() == "ISSUE_RESOLVED");
    }

    [Fact]
    public async Task Assigning_an_issue_notifies_only_the_assignee()
    {
        var (client, sam) = await SignInAsync("sam", AccountRole.STAFF);
        var tech = await Factory.CreateAccountAsync("tina", AccountRole.TECHNICIAN);
        var admin = await client.LoginAsync((await Factory.CreateAccountAsync("boss", AccountRole.ADMIN)).Username);
        var id = (await BodyAsync(await client.SendWithTokenAsync(HttpMethod.Post, Issues, sam.AccessToken, NewIssue())))
            .GetProperty("id").GetGuid();

        var assign = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Issues}/{id}/assign", admin.AccessToken, new { assigneeId = tech.Id, expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.OK, assign.StatusCode);

        var tina = await client.LoginAsync("tina");
        var tinaInbox = await BodyAsync(await client.GetWithTokenAsync("/api/operations/notifications", tina.AccessToken));
        var samInbox = await BodyAsync(await client.GetWithTokenAsync("/api/operations/notifications", sam.AccessToken));

        Assert.Contains(tinaInbox.GetProperty("items").EnumerateArray(), n => n.GetProperty("kind").GetString() == "ISSUE_ASSIGNED");
        Assert.DoesNotContain(samInbox.GetProperty("items").EnumerateArray(), n => n.GetProperty("kind").GetString() == "ISSUE_ASSIGNED");
        // The assignee (a Technician) can now open it although they did not report it.
        Assert.Equal(HttpStatusCode.OK, (await client.GetWithTokenAsync($"{Issues}/{id}", tina.AccessToken)).StatusCode);
    }

    [Fact]
    public async Task A_workflow_step_opens_at_most_one_issue()
    {
        var draft = new StepIssueDraft(Guid.NewGuid(), Guid.NewGuid(), "JOB-1", "REPORT", Guid.NewGuid(), null, null, "Box crushed");

        Guid first, second;
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            first = await scope.ServiceProvider.GetRequiredService<IIssueReporter>().ReportFromStepAsync(draft);
        }

        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            second = await scope.ServiceProvider.GetRequiredService<IIssueReporter>().ReportFromStepAsync(draft);
        }

        Assert.Equal(first, second);
        await using var check = Factory.Services.CreateAsyncScope();
        Assert.Equal(1, await check.ServiceProvider.GetRequiredService<OperationsMongoContext>().IssueReports
            .CountDocumentsAsync(i => i.JobStepId == draft.JobStepId));
    }

    [Fact]
    public async Task Invalid_issue_input_returns_400()
    {
        var (client, sam) = await SignInAsync("sam", AccountRole.STAFF);

        var robotWithoutRobot = await client.SendWithTokenAsync(
            HttpMethod.Post, Issues, sam.AccessToken, new { issueType = "ROBOT", severity = "LOW", description = "x" });
        var badSeverity = await client.SendWithTokenAsync(
            HttpMethod.Post, Issues, sam.AccessToken, new { issueType = "OTHER", severity = "URGENT", description = "x" });

        Assert.Equal(HttpStatusCode.BadRequest, robotWithoutRobot.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, badSeverity.StatusCode);
    }
}

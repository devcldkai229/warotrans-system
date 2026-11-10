using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Operations.Contracts;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Enums;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.IntegrationTests.Operations.AuditLogs;

/// <summary>SY-05 / OPS-02 audit trail and OPS-03 per-person inboxes.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class AuditLogEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();
        await using var scope = Factory.Services.CreateAsyncScope();
        var mongo = scope.ServiceProvider.GetRequiredService<OperationsMongoContext>();
        await mongo.AuditLogs.DeleteManyAsync(FilterDefinition<AuditLog>.Empty);
        await mongo.Notifications.DeleteManyAsync(FilterDefinition<Notification>.Empty);
    }

    private static async Task<JsonElement> BodyAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();

    [Fact]
    public async Task Role_change_and_password_reset_are_traced_with_actor_and_no_secret()
    {
        var staff = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        await Factory.CreateAccountAsync("boss", AccountRole.ADMIN);
        var client = CreateAnonymousClient();
        var admin = await client.LoginAsync("boss");

        await client.SendWithTokenAsync(HttpMethod.Put, $"/api/identity/accounts/{staff.Id}", admin.AccessToken,
            new { email = "sam@warotrans.test", fullName = "Sam", role = "TECHNICIAN" });
        var reset = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/identity/accounts/{staff.Id}/reset-password", admin.AccessToken);
        var temporary = (await BodyAsync(reset)).GetProperty("temporaryPassword").GetString()!;

        var response = await client.GetWithTokenAsync($"/api/operations/audit-logs?entityId={staff.Id}", admin.AccessToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var raw = await response.Content.ReadAsStringAsync();
        var items = (await BodyAsync(response)).GetProperty("items").EnumerateArray().ToList();

        var roleChange = Assert.Single(items, i => i.GetProperty("action").GetString() == "account.role_changed");
        Assert.Equal("STAFF", roleChange.GetProperty("before").GetProperty("role").GetString());
        Assert.Equal("TECHNICIAN", roleChange.GetProperty("after").GetProperty("role").GetString());
        Assert.Equal(admin.Account.Id, roleChange.GetProperty("actorAccountId").GetGuid());
        Assert.Contains(items, i => i.GetProperty("action").GetString() == "account.password_reset");
        Assert.DoesNotContain(temporary, raw);
    }

    [Fact]
    public async Task Staff_cannot_read_the_audit_trail_and_a_technician_only_sees_their_own()
    {
        await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var tech = await Factory.CreateAccountAsync("tina", AccountRole.TECHNICIAN);
        await Factory.CreateAccountAsync("boss", AccountRole.ADMIN);
        var client = CreateAnonymousClient();
        var sam = await client.LoginAsync("sam");
        var tina = await client.LoginAsync("tina");
        var admin = await client.LoginAsync("boss");

        // Something the admin did that has nothing to do with Tina's robots.
        var other = await Factory.CreateAccountAsync("zoe", AccountRole.STAFF);
        await client.SendWithTokenAsync(HttpMethod.Post, $"/api/identity/accounts/{other.Id}/reset-password", admin.AccessToken);
        // Something Tina did herself.
        await client.SendWithTokenAsync(HttpMethod.Post, "/api/identity/me/change-password", tina.AccessToken,
            new { currentPassword = IdentityTestSupport.Password, newPassword = "Brand-New-Pass-42" });
        var tinaFresh = await client.LoginAsync("tina", "Brand-New-Pass-42");

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetWithTokenAsync("/api/operations/audit-logs", sam.AccessToken)).StatusCode);

        var seen = (await BodyAsync(await client.GetWithTokenAsync("/api/operations/audit-logs", tinaFresh.AccessToken)))
            .GetProperty("items").EnumerateArray().Select(i => i.GetProperty("action").GetString()).ToList();
        Assert.Contains("account.password_changed", seen);
        Assert.DoesNotContain("account.password_reset", seen);
        _ = tech;
    }

    [Fact]
    public async Task Reading_a_notification_marks_it_read_for_that_person_only()
    {
        await Factory.CreateAccountAsync("ann", AccountRole.ADMIN);
        await Factory.CreateAccountAsync("ben", AccountRole.ADMIN);
        var client = CreateAnonymousClient();
        var ann = await client.LoginAsync("ann");
        var ben = await client.LoginAsync("ben");

        Guid id;
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            id = (await scope.ServiceProvider.GetRequiredService<INotificationService>().PublishAsync(
                new NotificationDraft(NotificationType.WARNING, "TEST", "For admins", "body")))!.Value;
        }

        Assert.Equal(HttpStatusCode.NoContent,
            (await client.SendWithTokenAsync(HttpMethod.Post, $"/api/operations/notifications/{id}/read", ann.AccessToken)).StatusCode);

        var annInbox = await BodyAsync(await client.GetWithTokenAsync("/api/operations/notifications", ann.AccessToken));
        var benInbox = await BodyAsync(await client.GetWithTokenAsync("/api/operations/notifications", ben.AccessToken));
        Assert.Equal(0, annInbox.GetProperty("unreadCount").GetInt32());
        Assert.Equal(1, benInbox.GetProperty("unreadCount").GetInt32());
    }

    [Fact]
    public async Task Notifications_reach_their_audience_only()
    {
        await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var bob = await Factory.CreateAccountAsync("bob", AccountRole.STAFF);
        await Factory.CreateAccountAsync("tina", AccountRole.TECHNICIAN);
        var client = CreateAnonymousClient();
        var sam = await client.LoginAsync("sam");
        var tina = await client.LoginAsync("tina");
        var robot = Guid.NewGuid();

        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
            await notifications.PublishAsync(new NotificationDraft(NotificationType.ALERT, "ADMIN_ONLY", "a", "a"));
            await notifications.PublishAsync(new NotificationDraft(NotificationType.WARNING, "FLOOR", "f", "f",
                Audience: NotificationAudience.Floor));
            await notifications.PublishAsync(new NotificationDraft(NotificationType.WARNING, "ROBOT_X", "r", "r", "ROBOT", robot,
                Audience: NotificationAudience.RobotCare(robot)));
            await notifications.PublishAsync(new NotificationDraft(NotificationType.ASSIGNMENT, "FOR_BOB", "b", "b",
                Audience: NotificationAudience.Person(bob.Id)));
        }

        static List<string?> Kinds(JsonElement inbox) =>
            inbox.GetProperty("items").EnumerateArray().Select(n => n.GetProperty("kind").GetString()).ToList();

        var samKinds = Kinds(await BodyAsync(await client.GetWithTokenAsync("/api/operations/notifications", sam.AccessToken)));
        var tinaKinds = Kinds(await BodyAsync(await client.GetWithTokenAsync("/api/operations/notifications", tina.AccessToken)));

        Assert.Equal(["FLOOR"], samKinds);
        // Tina has no robot assigned: the robot notification is not hers.
        Assert.Empty(tinaKinds);
    }
}

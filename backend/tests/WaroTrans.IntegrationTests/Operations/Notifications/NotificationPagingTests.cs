using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Operations.Contracts;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Enums;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.IntegrationTests.Operations.Notifications;

/// <summary>WEB-NOTIF-01: the notifications page pages through the inbox and narrows it by type and kind.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class NotificationPagingTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Route = "/api/operations/notifications";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record Item(Guid Id, string Type, string Kind, bool IsRead);

    private sealed record Inbox(int UnreadCount, int Total, List<Item> Items);

    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();
        await using var scope = Factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<OperationsMongoContext>().Notifications
            .DeleteManyAsync(FilterDefinition<Notification>.Empty);
    }

    private async Task<Inbox> InboxAsync(string query = "") =>
        (await Client.GetFromJsonAsync<Inbox>($"{Route}{query}", JsonOptions))!;

    private async Task<Guid> PublishAsync(string key, NotificationType type = NotificationType.WARNING, string kind = "TEST_KIND")
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var id = await scope.ServiceProvider.GetRequiredService<INotificationService>()
            .PublishAsync(new NotificationDraft(type, kind, $"Title {key}", "Details", "JOB", Guid.NewGuid(), key));
        return id!.Value;
    }

    [Fact]
    public async Task Pages_follow_each_other_without_repeating_or_skipping_a_notification()
    {
        // Published back to back, so several share a creation time: the order must still be total.
        var published = new List<Guid>();
        for (var i = 0; i < 5; i++)
        {
            published.Add(await PublishAsync($"page-{i}"));
        }

        var first = await InboxAsync("?take=2");
        var second = await InboxAsync("?take=2&skip=2");
        var third = await InboxAsync("?take=2&skip=4");

        Assert.Equal(5, first.Total);
        Assert.Equal(5, third.Total);
        Assert.Equal([2, 2, 1], new[] { first.Items.Count, second.Items.Count, third.Items.Count });
        var paged = first.Items.Concat(second.Items).Concat(third.Items).Select(i => i.Id).ToList();
        Assert.Equal(5, paged.Distinct().Count());
        Assert.Equal(published.Order(), paged.Order());
        Assert.Equal(paged, (await InboxAsync("?take=100")).Items.Select(i => i.Id));
    }

    [Fact]
    public async Task Skipping_past_the_end_is_an_empty_page_that_still_reports_the_total()
    {
        await PublishAsync("only");

        var inbox = await InboxAsync("?skip=50");

        Assert.Empty(inbox.Items);
        Assert.Equal(1, inbox.Total);
        Assert.Equal(1, inbox.UnreadCount);
    }

    [Fact]
    public async Task Type_and_kind_narrow_the_list_and_its_total_but_not_the_unread_count()
    {
        await PublishAsync("a", NotificationType.ALERT, "JOB_FAILED");
        await PublishAsync("b", NotificationType.ALERT, "ROBOT_OFFLINE");
        await PublishAsync("c", NotificationType.INFO, "JOB_FAILED");

        var alerts = await InboxAsync("?type=alert");
        Assert.Equal(2, alerts.Total);
        Assert.All(alerts.Items, i => Assert.Equal("ALERT", i.Type));

        var failedAlerts = await InboxAsync("?type=ALERT&kind=job_failed");
        var single = Assert.Single(failedAlerts.Items);
        Assert.Equal("JOB_FAILED", single.Kind);
        Assert.Equal(1, failedAlerts.Total);
        Assert.Equal(3, failedAlerts.UnreadCount);

        var unknown = await InboxAsync("?type=NOT_A_TYPE");
        Assert.Empty(unknown.Items);
        Assert.Equal(0, unknown.Total);
    }

    [Fact]
    public async Task The_total_of_the_unread_filter_shrinks_as_notifications_are_read()
    {
        var first = await PublishAsync("u1");
        await PublishAsync("u2");

        Assert.Equal(2, (await InboxAsync("?unreadOnly=true")).Total);
        await Client.PostAsync($"{Route}/{first}/read", null);

        var unread = await InboxAsync("?unreadOnly=true");
        Assert.Equal(1, unread.Total);
        Assert.Equal(2, (await InboxAsync()).Total);
    }
}

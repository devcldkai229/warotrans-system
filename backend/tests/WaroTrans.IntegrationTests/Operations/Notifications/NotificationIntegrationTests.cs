using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.ProcessRobotTelemetry;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Operations.Contracts;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Enums;
using WaroTrans.Operations.Persistence;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.IntegrationTests.Operations.Notifications;

[Collection(IntegrationCollection.Name)]
public sealed class NotificationIntegrationTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Route = "/api/operations/notifications";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record Item(
        Guid Id, string Type, string Kind, string Title, string Content, string? EntityType, Guid? EntityId,
        bool IsRead, DateTimeOffset? ReadAt, DateTimeOffset? ResolvedAt);

    private sealed record Inbox(int UnreadCount, List<Item> Items);

    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();
        await using var scope = Factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<OperationsMongoContext>().Notifications
            .DeleteManyAsync(FilterDefinition<Notification>.Empty);
    }

    private async Task<Inbox> InboxAsync(string query = "") =>
        (await Client.GetFromJsonAsync<Inbox>($"{Route}{query}", JsonOptions))!;

    private async Task<T> InScopeAsync<T>(Func<IServiceProvider, Task<T>> work)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        return await work(scope.ServiceProvider);
    }

    private Task PublishEventAsync<TEvent>(TEvent integrationEvent) where TEvent : IIntegrationEvent =>
        InScopeAsync(async sp =>
        {
            await sp.GetRequiredService<IIntegrationEventPublisher>().PublishAsync(integrationEvent);
            return 0;
        });

    private static NotificationDraft Draft(string key, string title = "Something happened") =>
        new(NotificationType.WARNING, "TEST_KIND", title, "Details", "JOB", Guid.NewGuid(), key);

    [Fact]
    public async Task A_published_notification_is_listed_unread_and_a_repeat_is_dropped_even_after_reading()
    {
        var first = await InScopeAsync(sp => sp.GetRequiredService<INotificationService>().PublishAsync(Draft("k1")));
        var repeat = await InScopeAsync(sp => sp.GetRequiredService<INotificationService>().PublishAsync(Draft("k1")));
        var other = await InScopeAsync(sp => sp.GetRequiredService<INotificationService>().PublishAsync(Draft("k2")));

        Assert.NotNull(first);
        Assert.Null(repeat);
        Assert.NotNull(other);
        var inbox = await InboxAsync();
        Assert.Equal(2, inbox.UnreadCount);
        Assert.Equal(new[] { first, other }.Order(), inbox.Items.Select(i => (Guid?)i.Id).Order());
        Assert.All(inbox.Items, i => Assert.False(i.IsRead));
        Assert.Equal("WARNING", inbox.Items[0].Type);
        Assert.Equal("JOB", inbox.Items[0].EntityType);

        var read = await Client.PostAsync($"{Route}/{first}/read", null);
        Assert.Equal(HttpStatusCode.NoContent, read.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Client.PostAsync($"{Route}/{first}/read", null)).StatusCode);   // idempotent

        var afterRead = await InboxAsync();
        Assert.Equal(1, afterRead.UnreadCount);
        Assert.True(afterRead.Items.Single(i => i.Id == first).IsRead);
        Assert.Equal([other], (await InboxAsync("?unreadOnly=true")).Items.Select(i => (Guid?)i.Id));

        // Read a moment ago: still the same situation, so a repeat does not ring the bell again.
        Assert.Null(await InScopeAsync(sp => sp.GetRequiredService<INotificationService>().PublishAsync(Draft("k1"))));
    }

    [Fact]
    public async Task Read_all_clears_the_unread_count_and_an_unknown_id_is_not_found()
    {
        await InScopeAsync(sp => sp.GetRequiredService<INotificationService>().PublishAsync(Draft("a")));
        await InScopeAsync(sp => sp.GetRequiredService<INotificationService>().PublishAsync(Draft("b")));

        Assert.Equal(HttpStatusCode.NoContent, (await Client.PostAsync($"{Route}/read-all", null)).StatusCode);

        var inbox = await InboxAsync();
        Assert.Equal(0, inbox.UnreadCount);
        Assert.All(inbox.Items, i => Assert.NotNull(i.ReadAt));
        Assert.Equal(HttpStatusCode.NotFound, (await Client.PostAsync($"{Route}/{Guid.NewGuid()}/read", null)).StatusCode);
    }

    [Fact]
    public async Task Resolving_a_key_marks_its_open_notifications_and_lets_the_situation_be_raised_again()
    {
        await InScopeAsync(sp => sp.GetRequiredService<INotificationService>().PublishAsync(Draft("robot:x")));

        await InScopeAsync(async sp =>
        {
            await sp.GetRequiredService<INotificationService>().ResolveAsync("robot:x");
            return 0;
        });

        Assert.NotNull((await InboxAsync()).Items.Single().ResolvedAt);
        Assert.NotNull(await InScopeAsync(sp => sp.GetRequiredService<INotificationService>().PublishAsync(Draft("robot:x"))));
    }

    [Fact]
    public async Task The_notification_endpoints_are_admin_only()
    {
        var anonymous = CreateAnonymousClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Route)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync($"{Route}/read-all", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync($"{Route}/{Guid.NewGuid()}/read", null)).StatusCode);
    }

    [Fact]
    public async Task A_failed_job_notifies_and_a_paused_job_is_resolved_once_it_runs_again()
    {
        var failed = Guid.NewGuid();
        var paused = Guid.NewGuid();

        await PublishEventAsync(new JobStatusChanged(failed, "JOB-1", "FAILED", null, "ROBOT_TIMEOUT"));
        await PublishEventAsync(new JobStatusChanged(paused, "JOB-2", "PAUSED", Guid.NewGuid(), "check_failed"));
        await PublishEventAsync(new JobStatusChanged(Guid.NewGuid(), "JOB-3", "RUNNING", null, null));       // progress: no notification
        await PublishEventAsync(new JobStatusChanged(Guid.NewGuid(), "JOB-4", "COMPLETED", null, null));

        var inbox = await InboxAsync();
        Assert.Equal(["JOB_FAILED", "JOB_PAUSED"], inbox.Items.Select(i => i.Kind).Order());
        var failure = inbox.Items.Single(i => i.Kind == "JOB_FAILED");
        Assert.Equal("ALERT", failure.Type);
        Assert.Equal(("JOB", failed), (failure.EntityType, failure.EntityId));
        Assert.Contains("ROBOT_TIMEOUT", failure.Content);
        Assert.All(inbox.Items, i => Assert.Null(i.ResolvedAt));

        await PublishEventAsync(new JobStatusChanged(paused, "JOB-2", "RUNNING", Guid.NewGuid(), null));

        var afterResume = await InboxAsync();
        Assert.NotNull(afterResume.Items.Single(i => i.Kind == "JOB_PAUSED").ResolvedAt);
        Assert.Null(afterResume.Items.Single(i => i.Kind == "JOB_FAILED").ResolvedAt);
    }

    [Fact]
    public async Task A_robot_going_offline_notifies_and_coming_back_resolves_it()
    {
        var robotId = Guid.NewGuid();

        await PublishEventAsync(new RobotConnectivityChanged(robotId, "RBT-9", false, RobotStatus.OFFLINE, null));
        await PublishEventAsync(new RobotConnectivityChanged(robotId, "RBT-9", false, RobotStatus.OFFLINE, null));   // flapping: one bell

        var offline = Assert.Single((await InboxAsync()).Items);
        Assert.Equal("ROBOT_OFFLINE", offline.Kind);
        Assert.Equal(("ROBOT", robotId), (offline.EntityType, offline.EntityId));
        Assert.Contains("RBT-9", offline.Title);

        await PublishEventAsync(new RobotConnectivityChanged(robotId, "RBT-9", true, RobotStatus.AVAILABLE, DateTimeOffset.UtcNow));

        Assert.NotNull(Assert.Single((await InboxAsync()).Items).ResolvedAt);
    }

    [Fact]
    public async Task Only_ack_timeouts_and_rejections_of_robot_commands_notify()
    {
        RobotCommandLifecycleChanged Command(string phase, string? error = null) =>
            new(Guid.NewGuid(), Guid.Parse("c0000000-0000-4000-8000-0000000000aa"), "RBT-9", "NAVIGATE", "X", null, null, null, error, phase);

        await PublishEventAsync(Command(RobotCommandLifecycleChanged.Phases.Issued));
        await PublishEventAsync(Command(RobotCommandLifecycleChanged.Phases.AckAccepted));
        await PublishEventAsync(Command(RobotCommandLifecycleChanged.Phases.Result));
        await PublishEventAsync(Command(RobotCommandLifecycleChanged.Phases.OfflineAbort));
        Assert.Empty((await InboxAsync()).Items);

        await PublishEventAsync(Command(RobotCommandLifecycleChanged.Phases.AckTimeout));
        await PublishEventAsync(Command(RobotCommandLifecycleChanged.Phases.AckRejected, "BUSY"));

        var kinds = (await InboxAsync()).Items.Select(i => i.Kind).Order().ToList();
        Assert.Equal(["ROBOT_COMMAND_REJECTED", "ROBOT_COMMAND_TIMEOUT"], kinds);
        Assert.Contains("BUSY", (await InboxAsync()).Items.Single(i => i.Kind == "ROBOT_COMMAND_REJECTED").Content);
    }

    [Fact]
    public async Task Telemetry_notifies_once_when_the_battery_drops_to_low_and_when_an_error_starts()
    {
        var robotId = await SeedRobotAsync("RBT-TEL", RobotStatus.AVAILABLE, 50);
        var boot = Guid.NewGuid();

        await SendTelemetryAsync("RBT-TEL", boot, 1, battery: 45);                    // still fine
        await SendTelemetryAsync("RBT-TEL", boot, 2, battery: 18);                    // crossed 20 %: notifies
        await SendTelemetryAsync("RBT-TEL", boot, 3, battery: 15);                    // already low: silent
        await SendTelemetryAsync("RBT-TEL", boot, 4, battery: 15, error: "E_STOP");   // new error: notifies
        await SendTelemetryAsync("RBT-TEL", boot, 5, battery: 14, error: "E_STOP");   // same error: silent

        var kinds = (await InboxAsync()).Items.Select(i => i.Kind).Order().ToList();
        Assert.Equal(["ROBOT_BATTERY_LOW", "ROBOT_ERROR"], kinds);
        var low = (await InboxAsync()).Items.Single(i => i.Kind == "ROBOT_BATTERY_LOW");
        Assert.Equal(("ROBOT", robotId), (low.EntityType, low.EntityId));
        Assert.Contains("18%", low.Content);
    }

    [Fact]
    public async Task A_charging_robot_with_a_low_battery_does_not_notify()
    {
        await SeedRobotAsync("RBT-CHG", RobotStatus.CHARGING, 50);

        await SendTelemetryAsync("RBT-CHG", Guid.NewGuid(), 1, battery: 12);

        Assert.Empty((await InboxAsync()).Items);
    }

    [Fact]
    public async Task A_new_notification_is_pushed_to_a_connected_admin()
    {
        var pushed = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var hub = new HubConnectionBuilder()
            .WithUrl(new Uri(Factory.Server.BaseAddress!, "/hubs/notifications"), options =>
            {
                options.HttpMessageHandlerFactory = _ => Factory.Server.CreateHandler();
            })
            .Build();
        hub.On<JsonElement>("notificationCreated", payload => pushed.TrySetResult(payload));
        await hub.StartAsync();

        var jobId = Guid.NewGuid();
        await PublishEventAsync(new JobStatusChanged(jobId, "JOB-PUSH", "FAILED", null, "ROBOT_TIMEOUT"));

        var message = await pushed.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal("JOB_FAILED", message.GetProperty("kind").GetString());
        Assert.Equal("ALERT", message.GetProperty("type").GetString());
        Assert.Equal("JOB", message.GetProperty("entityType").GetString());
        Assert.Equal(jobId, message.GetProperty("entityId").GetGuid());
        Assert.Contains("JOB-PUSH", message.GetProperty("title").GetString());
    }

    [Fact]
    public async Task An_anonymous_connection_cannot_subscribe_to_the_hub()
    {
        await using var hub = new HubConnectionBuilder()
            .WithUrl(new Uri(Factory.Server.BaseAddress!, "/hubs/notifications"), options =>
            {
                options.HttpMessageHandlerFactory = _ => Factory.Server.CreateHandler();
                options.Headers[TestAuthenticationHandler.AnonymousHeader] = "true";
            })
            .Build();

        var rejected = await Assert.ThrowsAsync<HttpRequestException>(() => hub.StartAsync());

        Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
    }

    private async Task<Guid> SeedRobotAsync(string code, RobotStatus status, decimal battery)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), code, "Robot " + code, DateTimeOffset.UtcNow);
        (robot.Status, robot.BatteryPercent) = (status, battery);
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot.Id;
    }

    private Task SendTelemetryAsync(string robotCode, Guid bootId, long sequence, decimal battery, string? error = null) =>
        InScopeAsync(async sp =>
        {
            await sp.GetRequiredService<ProcessRobotTelemetryHandler>().HandleAsync(
                new RobotTelemetryMessage
                {
                    SchemaVersion = 1,
                    MessageId = Guid.NewGuid(),
                    RobotCode = robotCode,
                    BootId = bootId,
                    Sequence = sequence,
                    SentAt = DateTimeOffset.UtcNow,
                    BatteryPercent = battery,
                    NavigationStatus = "IDLE",
                    LocalizationStatus = "LOCALIZED",
                    ErrorCode = error
                },
                CancellationToken.None);
            return 0;
        });
}

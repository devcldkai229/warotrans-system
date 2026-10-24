using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.Operations.Contracts;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Enums;
using WaroTrans.Operations.Persistence;
using WaroTrans.Operations.Services;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.IntegrationEvents;
using WaroTrans.Transportation.Persistence;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.IntegrationTests.Operations.Notifications;

/// <summary>
/// Notifications that depend on time or on waiting (a job nobody started, a step nobody confirmed), on the aggregated
/// state of a transport request, and on how a repeat is dropped.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class NotificationTierTwoTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Route = "/api/operations/notifications";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record Item(Guid Id, string Type, string Kind, string Title, string Content, string? EntityType, Guid? EntityId, bool IsRead, DateTimeOffset? ResolvedAt);

    private sealed record Inbox(int UnreadCount, List<Item> Items);

    private sealed class ManualClock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => Now;
    }

    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();
        await using var scope = Factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<OperationsMongoContext>().Notifications
            .DeleteManyAsync(FilterDefinition<Notification>.Empty);
    }

    private async Task<Inbox> InboxAsync() => (await Client.GetFromJsonAsync<Inbox>(Route, JsonOptions))!;

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

    // ---------------------------------------------------------------- dropping repeats over time

    private Task<Guid?> PublishAt(ManualClock clock, string key, bool oncePerSituation) =>
        InScopeAsync(sp => new NotificationService(
                sp.GetRequiredService<OperationsMongoContext>(),
                sp.GetRequiredService<IIntegrationEventPublisher>(),
                clock)
            .PublishAsync(new NotificationDraft(
                NotificationType.WARNING, "TEST", "Title", "Content", "JOB", Guid.NewGuid(), key, oncePerSituation)));

    private Task ReadAll() => Client.PostAsync($"{Route}/read-all", null);

    [Fact]
    public async Task A_repeat_is_dropped_while_unread_and_for_ten_minutes_after_it_was_read_then_let_through()
    {
        var t0 = DateTimeOffset.UtcNow.AddHours(-3);
        var clock = new ManualClock(t0);

        Assert.NotNull(await PublishAt(clock, "robot:1:offline", oncePerSituation: false));

        clock.Now = t0.AddMinutes(30);
        Assert.Null(await PublishAt(clock, "robot:1:offline", false));          // unread: however old, it still counts

        await ReadAll();
        // The window is measured from when the notification was created (t0): 30 minutes ago is outside it already,
        // so reading the old one lets a new one through.
        Assert.NotNull(await PublishAt(clock, "robot:1:offline", false));
    }

    [Fact]
    public async Task A_read_notification_still_blocks_a_repeat_inside_the_ten_minute_window()
    {
        var t0 = DateTimeOffset.UtcNow.AddHours(-3);
        var clock = new ManualClock(t0);
        Assert.NotNull(await PublishAt(clock, "robot:2:offline", false));
        await ReadAll();

        clock.Now = t0.AddMinutes(9);
        Assert.Null(await PublishAt(clock, "robot:2:offline", false));

        clock.Now = t0.AddMinutes(11);
        Assert.NotNull(await PublishAt(clock, "robot:2:offline", false));
    }

    [Fact]
    public async Task A_once_per_situation_notification_blocks_repeats_for_as_long_as_it_is_unresolved_even_when_read()
    {
        var t0 = DateTimeOffset.UtcNow.AddHours(-3);
        var clock = new ManualClock(t0);
        Assert.NotNull(await PublishAt(clock, "job:9:unstarted", oncePerSituation: true));
        await ReadAll();

        clock.Now = t0.AddHours(2);
        Assert.Null(await PublishAt(clock, "job:9:unstarted", true));            // read and two hours old: still the same situation

        await InScopeAsync(async sp =>
        {
            await sp.GetRequiredService<INotificationService>().ResolveAsync("job:9:unstarted");
            return 0;
        });
        Assert.NotNull(await PublishAt(clock, "job:9:unstarted", true));         // resolved: a new one is a new situation
    }

    // ---------------------------------------------------------------- jobs nobody started, steps nobody confirmed

    [Fact]
    public async Task A_job_waiting_to_start_notifies_once_whatever_happens_to_the_notification_and_is_resolved_when_it_starts()
    {
        var jobId = Guid.NewGuid();
        var since = DateTimeOffset.UtcNow.AddMinutes(-12);

        await PublishEventAsync(new JobWaitingToStart(jobId, "JOB-WAIT", since));
        await PublishEventAsync(new JobWaitingToStart(jobId, "JOB-WAIT", since));   // the monitor raises it every cycle

        var notification = Assert.Single((await InboxAsync()).Items);
        Assert.Equal("JOB_NOT_STARTED", notification.Kind);
        Assert.Equal("WARNING", notification.Type);
        Assert.Equal(("JOB", jobId), (notification.EntityType, notification.EntityId));
        Assert.Contains("JOB-WAIT", notification.Title);
        Assert.Contains("12 min", notification.Content);

        await ReadAll();
        await PublishEventAsync(new JobWaitingToStart(jobId, "JOB-WAIT", since));
        Assert.Single((await InboxAsync()).Items);                                  // read, and still no second one

        await PublishEventAsync(new JobStatusChanged(jobId, "JOB-WAIT", "CREATED", null, null));
        Assert.Null(Assert.Single((await InboxAsync()).Items).ResolvedAt);          // not started yet

        await PublishEventAsync(new JobStatusChanged(jobId, "JOB-WAIT", "RUNNING", Guid.NewGuid(), null));
        Assert.NotNull(Assert.Single((await InboxAsync()).Items).ResolvedAt);
    }

    [Theory]
    [InlineData(5, "5 min")]
    [InlineData(59, "59 min")]
    [InlineData(185, "3 h 05 min")]
    [InlineData(47 * 60 + 30, "47 h 30 min")]
    [InlineData(8 * 24 * 60 + 90, "8 days")]
    public async Task How_long_a_job_has_waited_is_written_in_a_readable_unit(int minutes, string expected)
    {
        await PublishEventAsync(new JobWaitingToStart(Guid.NewGuid(), "JOB-UNIT", DateTimeOffset.UtcNow.AddMinutes(-minutes).AddSeconds(-5)));

        Assert.Contains($"waiting {expected} for a robot", Assert.Single((await InboxAsync()).Items).Content);
    }

    [Fact]
    public async Task A_step_waiting_for_a_person_notifies_and_is_resolved_once_the_step_is_no_longer_waiting()
    {
        var jobId = Guid.NewGuid();
        var stepId = Guid.NewGuid();

        await PublishEventAsync(new JobStepWaitingForPerson(jobId, "JOB-HUMAN", stepId, "Confirm pallet", DateTimeOffset.UtcNow.AddMinutes(-20)));
        await PublishEventAsync(new JobStepWaitingForPerson(jobId, "JOB-HUMAN", stepId, "Confirm pallet", DateTimeOffset.UtcNow.AddMinutes(-19)));

        var notification = Assert.Single((await InboxAsync()).Items);
        Assert.Equal("JOB_STEP_WAITING_FOR_PERSON", notification.Kind);
        Assert.Equal(jobId, notification.EntityId);
        Assert.Contains("Confirm pallet", notification.Content);
        Assert.Contains("20 min", notification.Content);

        await PublishEventAsync(new JobStepStatusChanged(jobId, Guid.NewGuid(), stepId, "CONFIRM_PALLET", "WAITING", null));
        Assert.Null(Assert.Single((await InboxAsync()).Items).ResolvedAt);

        await PublishEventAsync(new JobStepStatusChanged(jobId, Guid.NewGuid(), stepId, "CONFIRM_PALLET", "COMPLETED", null));
        Assert.NotNull(Assert.Single((await InboxAsync()).Items).ResolvedAt);
    }

    [Fact]
    public async Task The_monitor_is_registered_with_the_documented_defaults()
    {
        var monitors = Factory.Services.GetServices<IHostedService>().OfType<StalledWorkMonitorHostedService>().ToList();
        Assert.Single(monitors);

        var options = Factory.Services.GetRequiredService<IOptions<StalledWorkOptions>>().Value;
        Assert.Equal((10, 15, 60), (options.UnstartedJobMinutes, options.HumanStepMinutes, options.CheckIntervalSeconds));
        await Task.CompletedTask;
    }

    [Fact]
    public async Task One_check_reports_only_jobs_and_steps_that_have_waited_too_long_and_never_twice()
    {
        var now = DateTimeOffset.UtcNow;
        var ids = await SeedWaitingWorkAsync(now);

        var raised = await InScopeAsync(sp => sp.GetRequiredService<StalledWorkChecker>().CheckAsync(CancellationToken.None));

        // old CREATED job + old QUEUED job + one human step waiting 20 min
        Assert.Equal(3, raised);
        var inbox = await InboxAsync();
        Assert.Equal(3, inbox.Items.Count);
        Assert.Equal(
            new[] { ids.OldCreated, ids.OldQueued }.Order(),
            inbox.Items.Where(i => i.Kind == "JOB_NOT_STARTED").Select(i => i.EntityId!.Value).Order());
        var human = Assert.Single(inbox.Items, i => i.Kind == "JOB_STEP_WAITING_FOR_PERSON");
        Assert.Equal(ids.RunningJob, human.EntityId);
        Assert.Contains("Confirm handover", human.Content);          // the step's name, read from the workflow

        // The monitor runs again a minute later: the same things are raised again, but nobody is told twice.
        Assert.Equal(3, await InScopeAsync(sp => sp.GetRequiredService<StalledWorkChecker>().CheckAsync(CancellationToken.None)));
        Assert.Equal(3, (await InboxAsync()).Items.Count);
    }

    private sealed record Seeded(Guid OldCreated, Guid OldQueued, Guid RunningJob);

    private async Task<Seeded> SeedWaitingWorkAsync(DateTimeOffset now)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();

        var workflow = new Workflow
        {
            Id = Guid.NewGuid(),
            Code = "WF_STALLED",
            VersionNo = 1,
            Name = "Stalled",
            Status = WorkflowStatus.PUBLISHED,
            CreatedBy = Guid.NewGuid(),
            CreatedAt = now.AddDays(-1)
        };
        var workflowTask = new WorkflowTask { Id = Guid.NewGuid(), WorkflowId = workflow.Id, TaskKey = "T", Name = "T", SequenceNo = 1 };
        var humanDefinition = new WorkflowStep
        {
            Id = Guid.NewGuid(), WorkflowTaskId = workflowTask.Id, StepKey = "CONFIRM_HANDOVER", Name = "Confirm handover",
            StepType = StepType.HUMAN_INTERACTION, SequenceNo = 1
        };
        var waitDefinition = new WorkflowStep
        {
            Id = Guid.NewGuid(), WorkflowTaskId = workflowTask.Id, StepKey = "COOL_DOWN", Name = "Cool down",
            StepType = StepType.WAIT, SequenceNo = 2
        };
        db.Workflows.Add(workflow);
        db.WorkflowTasks.Add(workflowTask);
        db.WorkflowSteps.AddRange(humanDefinition, waitDefinition);

        Job NewJob(JobStatus status, DateTimeOffset created, DateTimeOffset? queued = null) => new()
        {
            Id = Guid.NewGuid(),
            JobNo = "JOB-CHK-" + Guid.NewGuid().ToString("N")[..8],
            WorkflowId = workflow.Id,
            MapVersionId = Guid.NewGuid(),
            ProvisioningKey = Guid.NewGuid().ToString("N"),
            Status = status,
            CreatedAt = created,
            QueuedAt = queued
        };

        var oldCreated = NewJob(JobStatus.CREATED, now.AddMinutes(-15));
        var oldQueued = NewJob(JobStatus.QUEUED, now.AddMinutes(-30), queued: now.AddMinutes(-11));
        var recentCreated = NewJob(JobStatus.CREATED, now.AddMinutes(-2));
        var oldRunning = NewJob(JobStatus.RUNNING, now.AddMinutes(-60));              // started: not "waiting to start"
        var oldCompleted = NewJob(JobStatus.COMPLETED, now.AddMinutes(-90));
        db.Jobs.AddRange(oldCreated, oldQueued, recentCreated, oldRunning, oldCompleted);

        JobStep NewStep(Job job, WorkflowStep definition, JobStepStatus status, int startedMinutesAgo)
        {
            var task = new JobTask { Id = Guid.NewGuid(), JobId = job.Id, WorkflowTaskId = workflowTask.Id, SequenceNo = 1, Status = JobTaskStatus.RUNNING };
            db.JobTasks.Add(task);
            return new JobStep
            {
                Id = Guid.NewGuid(),
                JobTaskId = task.Id,
                WorkflowStepId = definition.Id,
                SequenceNo = 1,
                StepType = definition.StepType,
                Status = status,
                StartedAt = now.AddMinutes(-startedMinutesAgo)
            };
        }

        var longHumanWait = NewStep(oldRunning, humanDefinition, JobStepStatus.WAITING, 20);      // reported
        var shortHumanWait = NewStep(recentCreated, humanDefinition, JobStepStatus.WAITING, 5);   // job is not RUNNING and 5 min is short
        var longTimerWait = NewStep(oldRunning, waitDefinition, JobStepStatus.WAITING, 60);       // a timer, not a person
        var confirmed = NewStep(oldRunning, humanDefinition, JobStepStatus.COMPLETED, 45);        // no longer waiting
        db.JobSteps.AddRange(longHumanWait, shortHumanWait, longTimerWait, confirmed);

        await db.SaveChangesAsync();
        return new Seeded(oldCreated.Id, oldQueued.Id, oldRunning.Id);
    }

    // ---------------------------------------------------------------- transport requests

    [Fact]
    public async Task A_request_where_every_container_failed_notifies_as_an_alert_and_supersedes_the_partial_one()
    {
        var request = await SeedRequestAsync(containers: 2);

        await FailAsync(request, 0);                                                 // one failed, one still open
        var early = Assert.Single((await InboxAsync()).Items);
        Assert.Equal("REQUEST_PARTIALLY_FAILED", early.Kind);
        Assert.Contains("1 of 2", early.Content);

        await FailAsync(request, 1);                                                 // now all of it failed

        var items = (await InboxAsync()).Items;
        var failed = Assert.Single(items, i => i.Kind == "REQUEST_FAILED");
        Assert.Equal("ALERT", failed.Type);
        Assert.Equal(("REQUEST", request.Id), (failed.EntityType, failed.EntityId));
        Assert.Contains(request.RequestCode, failed.Title);
        Assert.Contains("2 container", failed.Content);
        Assert.Null(failed.ResolvedAt);
        Assert.NotNull(items.Single(i => i.Kind == "REQUEST_PARTIALLY_FAILED").ResolvedAt);
    }

    [Fact]
    public async Task A_delivery_in_progress_is_not_news_but_a_failed_container_in_it_is()
    {
        var request = await SeedRequestAsync(containers: 3);

        await DeliverAsync(request, 0);                  // PARTIALLY_COMPLETED because one was delivered: healthy, silent
        Assert.Empty((await InboxAsync()).Items);

        await FailAsync(request, 1);                     // now something went wrong
        var notification = Assert.Single((await InboxAsync()).Items);
        Assert.Equal("REQUEST_PARTIALLY_FAILED", notification.Kind);
        Assert.Equal("WARNING", notification.Type);
        Assert.Contains("1 of 3", notification.Content);
        Assert.Contains("1 delivered", notification.Content);

        await DeliverAsync(request, 2);                  // the last one is delivered: still one notification, not two
        Assert.Single((await InboxAsync()).Items);
    }

    [Fact]
    public async Task A_request_that_completes_resolves_an_earlier_partial_failure_notification()
    {
        var request = await SeedRequestAsync(containers: 2);
        await FailAsync(request, 0);
        await DeliverAsync(request, 1);
        Assert.Equal("REQUEST_PARTIALLY_FAILED", Assert.Single((await InboxAsync()).Items).Kind);

        // Simulate the failed container being redone and delivered (the request then aggregates to COMPLETED).
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TransportationDbContext>();
            var detail = db.TransportRequestDetails.Single(d => d.TransportRequestId == request.Id && d.SequenceNo == 1);
            detail.Status = TransportRequestDetailStatus.IN_PROGRESS;
            await db.SaveChangesAsync();
        }

        await DeliverAsync(request, 0);

        Assert.NotNull(Assert.Single((await InboxAsync()).Items).ResolvedAt);
    }

    private sealed record SeededRequest(Guid Id, string RequestCode, Guid[] Containers);

    private async Task<SeededRequest> SeedRequestAsync(int containers)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TransportationDbContext>();
        var now = DateTimeOffset.UtcNow;
        var request = new TransportRequest
        {
            Id = Guid.NewGuid(),
            RequestCode = "REQ-NOTIFY-" + Guid.NewGuid().ToString("N")[..8],
            WarehouseId = Guid.NewGuid(),
            MapVersionId = Guid.NewGuid(),
            WorkflowId = Guid.NewGuid(),
            RequestedBy = Guid.NewGuid(),
            Status = TransportRequestStatus.IN_PROGRESS,
            PlanSchemaVersion = TransportRequest.CurrentPlanSchemaVersion,
            SubmittedAt = now,
            CreatedAt = now,
            UpdatedAt = now
        };
        var containerIds = Enumerable.Range(0, containers).Select(_ => Guid.NewGuid()).ToArray();
        for (var i = 0; i < containers; i++)
        {
            request.Details.Add(new TransportRequestDetail
            {
                Id = Guid.NewGuid(),
                TransportRequestId = request.Id,
                SequenceNo = i + 1,
                ContainerId = containerIds[i],
                SourceEndpointId = Guid.NewGuid(),
                DestinationEndpointId = Guid.NewGuid(),
                Status = TransportRequestDetailStatus.IN_PROGRESS,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        db.TransportRequests.Add(request);
        await db.SaveChangesAsync();
        return new SeededRequest(request.Id, request.RequestCode, containerIds);
    }

    private Task DeliverAsync(SeededRequest request, int container) => ContainerAsync(request, container, "DELIVERED");

    private Task FailAsync(SeededRequest request, int container) => ContainerAsync(request, container, "FAILED");

    // Goes through the real handler: container status → request status → TransportRequestProgressed → notification.
    private Task ContainerAsync(SeededRequest request, int container, string status) =>
        PublishEventAsync(new JobContainerStatusChanged(Guid.NewGuid(), request.Id, request.Containers[container], status));
}

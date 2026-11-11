using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.Dispatch;
using WaroTrans.Fleet.Features.Positioning;
using WaroTrans.Fleet.Features.ProcessRobotCommandResult;
using WaroTrans.Fleet.Persistence;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.IntegrationTests.Transportation;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Features.RobotCare;
using WaroTrans.WorkflowExecution.Persistence;
using NavEndpoint = WaroTrans.Navigation.Entities.Endpoint;

namespace WaroTrans.IntegrationTests.Fleet.Positioning;

/// <summary>
/// FL-08 auto return-to-park as a Fleet positioning intent: claims in the database, gives way to a Job (CANCEL, wait for
/// the NAVIGATE to end, then the Job's MOVE), ignores late MQTT results, keeps parking places single, and closes on its own
/// when the robot arrives, fails or goes offline. Traffic runs in Shadow mode here: the Semantic reconcile is covered by
/// the traffic unit tests, not by these.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class RobotPositioningTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private IServiceProvider Services => Factory.Services;

    private CapturingMqttRobotCommandPublisher Mqtt => Services.GetRequiredService<CapturingMqttRobotCommandPublisher>();

    [Fact]
    public async Task Start_claims_robot_and_place_and_sends_a_navigate_that_belongs_to_no_job()
    {
        var seed = await SeedAsync();
        var robot = await SeedRobotAsync(seed);
        var park = await AddParkAsync(seed, 0.5);

        var intentId = await Positioning(s => s.StartReturnToParkAsync(robot.Id, park, 0.5, 4.0, Math.PI, CancellationToken.None));

        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var intent = await db.RobotPositioningIntents.SingleAsync(i => i.Id == intentId);
        Assert.Equal((PositioningIntentStatus.NAVIGATING, park), (intent.Status, intent.TargetEndpointId));
        var command = await db.RobotCommands.SingleAsync(c => c.Id == intent.NavigateCommandId);
        Assert.Equal(RobotCommandType.NAVIGATE_TO_POSE, command.Type);
        Assert.Null(command.JobAssignmentId);
        Assert.Null(command.JobStepId);
        Assert.Contains(Mqtt.Published, m => m.CommandId == command.Id && m.Type == RobotCommandTypes.NavigateToPose);
        Assert.Equal(RobotStatus.RESERVED, (await db.Robots.SingleAsync(r => r.Id == robot.Id)).Status);
    }

    [Fact]
    public async Task Two_robots_racing_for_one_parking_place_get_one_claim_and_a_robot_gets_one_intent()
    {
        var seed = await SeedAsync();
        var a = await SeedRobotAsync(seed);
        var b = await SeedRobotAsync(seed);
        var park = await AddParkAsync(seed, 0.5);

        var race = await Task.WhenAll(
            Try(() => Positioning(s => s.StartReturnToParkAsync(a.Id, park, 0.5, 4.0, 0, CancellationToken.None))),
            Try(() => Positioning(s => s.StartReturnToParkAsync(b.Id, park, 0.5, 4.0, 0, CancellationToken.None))));

        Assert.Single(race, r => r is null);
        Assert.Single(race, r => r == "positioning_conflict");

        var winner = race[0] is null ? a : b;
        var other = await AddParkAsync(seed, 1.5);
        Assert.Equal("positioning_conflict",
            await Try(() => Positioning(s => s.StartReturnToParkAsync(winner.Id, other, 1.5, 4.0, 0, CancellationToken.None))));
    }

    [Fact]
    public async Task Dispatch_still_offers_a_robot_that_is_only_returning_to_park()
    {
        var seed = await SeedAsync();
        var parking = await SeedRobotAsync(seed);
        var park = await AddParkAsync(seed, 0.5);
        await Positioning(s => s.StartReturnToParkAsync(parking.Id, park, 0.5, 4.0, 0, CancellationToken.None));

        await using var scope = Services.CreateAsyncScope();
        var candidates = await scope.ServiceProvider.GetRequiredService<DispatchService>()
            .EvaluateAsync(new DispatchQuery(seed.MapVersionId, null, null, new HashSet<Guid>()), CancellationToken.None);

        var candidate = Assert.Single(candidates, c => c.RobotId == parking.Id);
        Assert.True(candidate.Eligible, string.Join(",", candidate.Reasons));
        Assert.Contains(candidate.Notes, n => n.StartsWith("returning_to_park", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Yield_cancels_once_waits_for_the_navigate_to_end_and_then_hands_over()
    {
        var seed = await SeedAsync();
        var robot = await SeedRobotAsync(seed);
        var park = await AddParkAsync(seed, 0.5);
        var intentId = await Positioning(s => s.StartReturnToParkAsync(robot.Id, park, 0.5, 4.0, 0, CancellationToken.None));
        var navigateId = await NavigateIdAsync(intentId);
        var job = Guid.NewGuid();

        var first = await Positioning(s => s.YieldAsync(robot.Id, job, CancellationToken.None));
        var again = await Positioning(s => s.YieldAsync(robot.Id, job, CancellationToken.None));

        Assert.Equal((false, "positioning_cancel_pending"), (first.IsReady, first.WaitingFor));
        Assert.False(again.IsReady);
        Assert.Single(Mqtt.Published, m => m.Type == RobotCommandTypes.Cancel && m.RobotCode == robot.Code);

        await ResultAsync(robot.Code, navigateId, RobotCommandOutcomes.Canceled);
        var ready = await Positioning(s => s.YieldAsync(robot.Id, job, CancellationToken.None));

        Assert.True(ready.IsReady, ready.WaitingFor);
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var intent = await db.RobotPositioningIntents.SingleAsync(i => i.Id == intentId);
        Assert.Equal((PositioningIntentStatus.YIELDED, job), (intent.Status, intent.YieldToJobId));
        Assert.Equal(RobotStatus.AVAILABLE, (await db.Robots.SingleAsync(r => r.Id == robot.Id)).Status);
    }

    [Fact]
    public async Task The_hand_over_waits_while_the_robot_pose_is_not_fresh()
    {
        var seed = await SeedAsync();
        var robot = await SeedRobotAsync(seed);
        var park = await AddParkAsync(seed, 0.5);
        var intentId = await Positioning(s => s.StartReturnToParkAsync(robot.Id, park, 0.5, 4.0, 0, CancellationToken.None));
        var job = Guid.NewGuid();
        await Positioning(s => s.YieldAsync(robot.Id, job, CancellationToken.None));
        await ResultAsync(robot.Code, await NavigateIdAsync(intentId), RobotCommandOutcomes.Canceled);
        await using (var scope = Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            (await db.Robots.SingleAsync(r => r.Id == robot.Id)).LastTelemetryAt = DateTimeOffset.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        var stale = await Positioning(s => s.YieldAsync(robot.Id, job, CancellationToken.None));

        // Traffic is rebuilt only from a pose the robot reported just now.
        Assert.Equal((false, "positioning_pose_unverified"), (stale.IsReady, stale.WaitingFor));
        await using var check = Services.CreateAsyncScope();
        Assert.Equal(PositioningIntentStatus.YIELDING,
            (await check.ServiceProvider.GetRequiredService<FleetDbContext>().RobotPositioningIntents.SingleAsync(i => i.Id == intentId)).Status);
    }

    [Fact]
    public async Task A_late_result_of_the_parking_navigate_does_not_touch_the_robot_or_the_intent()
    {
        var seed = await SeedAsync();
        var robot = await SeedRobotAsync(seed);
        var park = await AddParkAsync(seed, 0.5);
        var intentId = await Positioning(s => s.StartReturnToParkAsync(robot.Id, park, 0.5, 4.0, 0, CancellationToken.None));
        var navigateId = await NavigateIdAsync(intentId);
        var job = Guid.NewGuid();
        await Positioning(s => s.YieldAsync(robot.Id, job, CancellationToken.None));
        await ResultAsync(robot.Code, navigateId, RobotCommandOutcomes.Canceled);
        await Positioning(s => s.YieldAsync(robot.Id, job, CancellationToken.None));

        // The Job's own command now holds the robot.
        var jobCommand = Guid.NewGuid();
        await using (var scope = Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var row = await db.Robots.SingleAsync(r => r.Id == robot.Id);
            row.ReserveForCommand(jobCommand, DateTimeOffset.UtcNow);
            await db.SaveChangesAsync();
        }

        await ResultAsync(robot.Code, navigateId, RobotCommandOutcomes.Succeeded);

        await using var check = Services.CreateAsyncScope();
        var fleet = check.ServiceProvider.GetRequiredService<FleetDbContext>();
        var after = await fleet.Robots.SingleAsync(r => r.Id == robot.Id);
        Assert.Equal((RobotStatus.RESERVED, (Guid?)jobCommand), (after.Status, after.CurrentCommandId));
        Assert.Equal(PositioningIntentStatus.YIELDED, (await fleet.RobotPositioningIntents.SingleAsync(i => i.Id == intentId)).Status);
        Assert.Equal(RobotCommandOutcomes.Canceled, (await fleet.RobotCommands.SingleAsync(c => c.Id == navigateId)).Outcome);
    }

    [Fact]
    public async Task Settle_closes_an_arrived_intent_and_one_whose_robot_went_offline()
    {
        var seed = await SeedAsync();
        var arrives = await SeedRobotAsync(seed);
        var dropsOut = await SeedRobotAsync(seed);
        var parkA = await AddParkAsync(seed, 0.5);
        var parkB = await AddParkAsync(seed, 1.5);
        var arrivedIntent = await Positioning(s => s.StartReturnToParkAsync(arrives.Id, parkA, 0.5, 4.0, 0, CancellationToken.None));
        var offlineIntent = await Positioning(s => s.StartReturnToParkAsync(dropsOut.Id, parkB, 1.5, 4.0, 0, CancellationToken.None));

        await ResultAsync(arrives.Code, await NavigateIdAsync(arrivedIntent), RobotCommandOutcomes.Succeeded);
        await using (var scope = Services.CreateAsyncScope())
        {
            // What RobotConnectivityMonitorHostedService does when the heartbeat stops.
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var navigateId = await NavigateIdAsync(offlineIntent);
            var command = await db.RobotCommands.SingleAsync(c => c.Id == navigateId);
            command.TryAbortOffline(DateTimeOffset.UtcNow);
            var robot = await db.Robots.SingleAsync(r => r.Id == dropsOut.Id);
            robot.IsOnline = false;
            robot.MarkAvailable(DateTimeOffset.UtcNow);
            await db.SaveChangesAsync();
        }

        Assert.Equal(2, await Positioning(s => s.SettleAsync(CancellationToken.None)));

        await using var check = Services.CreateAsyncScope();
        var fleet = check.ServiceProvider.GetRequiredService<FleetDbContext>();
        Assert.Equal(PositioningIntentStatus.ARRIVED, (await fleet.RobotPositioningIntents.SingleAsync(i => i.Id == arrivedIntent)).Status);
        var failed = await fleet.RobotPositioningIntents.SingleAsync(i => i.Id == offlineIntent);
        Assert.Equal(PositioningIntentStatus.FAILED, failed.Status);
        Assert.Contains("ROBOT_OFFLINE", failed.EndReason);
        // Both places are free again.
        Assert.Empty(await Positioning(s => s.LiveTargetsAsync(seed.MapVersionId, CancellationToken.None)));
    }

    [Fact]
    public async Task Auto_return_sends_idle_robots_to_free_parking_places_only_and_skips_offline_ones()
    {
        var seed = await SeedAsync();
        var first = await SeedRobotAsync(seed);
        var second = await SeedRobotAsync(seed);
        var offline = await SeedRobotAsync(seed, online: false);
        var park = await AddParkAsync(seed, 0.5);

        var sent = await AutoReturnAsync();

        Assert.Equal(1, sent);
        await using var scope = Services.CreateAsyncScope();
        var intent = Assert.Single(await scope.ServiceProvider.GetRequiredService<FleetDbContext>().RobotPositioningIntents.ToListAsync());
        Assert.Equal(park, intent.TargetEndpointId);
        Assert.Contains(intent.RobotId, new[] { first.Id, second.Id });
        Assert.NotEqual(offline.Id, intent.RobotId);
        // Nothing for a Job to clean up: no Job, no Transport Request, no JobContainer.
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        Assert.Equal(0, await execution.Jobs.CountAsync());
        Assert.Equal(0, await execution.JobContainers.CountAsync());
    }

    [Fact]
    public async Task A_job_given_to_a_parking_robot_waits_for_the_hand_over_before_its_first_move()
    {
        var seed = await SeedAsync();
        var robot = await SeedRobotAsync(seed);
        var park = await AddParkAsync(seed, 0.5);
        var intentId = await Positioning(s => s.StartReturnToParkAsync(robot.Id, park, 0.5, 4.0, 0, CancellationToken.None));
        var parkNavigate = await NavigateIdAsync(intentId);
        var workflowId = await TransportRequestScenario.CreatePublishedWorkflowAsync(Client);
        var requestId = await TransportRequestScenario.SubmitAsync(Client, seed, workflowId);
        var queued = await (await Client.PostAsync($"/api/transportation/transport-requests/{requestId}/queue", null))
            .Content.ReadFromJsonAsync<JsonElement>();
        var jobId = queued.GetProperty("jobs")[0].GetProperty("jobId").GetGuid();

        await Engine(e => e.StartAsync(jobId, robot.Id, CancellationToken.None));

        var move = await FirstMoveAsync(jobId);
        Assert.Equal(JobStepStatus.WAITING, move.Status);
        Assert.Equal("positioning_cancel_pending", move.OutputValues["waitingFor"].GetString());
        Assert.DoesNotContain(Mqtt.Published, m => m.Type == RobotCommandTypes.NavigateToPose && m.JobStepId == move.Id);
        Assert.Contains(Mqtt.Published, m => m.Type == RobotCommandTypes.Cancel && m.RobotCode == robot.Code);

        await ResultAsync(robot.Code, parkNavigate, RobotCommandOutcomes.Canceled);
        await Task.Delay(TimeSpan.FromSeconds(1.2));
        await Engine(e => e.WakeDueWaitStepsAsync(CancellationToken.None));

        // Past the gate: the MOVE now goes to traffic. The test map has no traffic graph, so routing itself fails here
        // (traffic_*); what matters is that it is no longer held for the parking robot and was not failed by it.
        var released = await FirstMoveAsync(jobId);
        Assert.NotEqual(JobStepStatus.WAITING, released.Status);
        Assert.False(released.OutputValues.ContainsKey(JobExecutionEngine.PositioningWaitSinceKey));
        Assert.DoesNotContain("positioning", released.ErrorCode ?? string.Empty, StringComparison.Ordinal);
        await using var scope = Services.CreateAsyncScope();
        Assert.Equal(PositioningIntentStatus.YIELDED,
            (await scope.ServiceProvider.GetRequiredService<FleetDbContext>().RobotPositioningIntents.SingleAsync(i => i.Id == intentId)).Status);
    }

    [Fact]
    public async Task With_every_parking_place_taken_an_idle_robot_goes_to_the_queue_point()
    {
        var seed = await SeedAsync();
        var park = await AddParkAsync(seed, 0.5);
        // Parked 0.15 m off the endpoint (lab localization error): it still occupies the place, and is not sent again.
        var parked = await SeedRobotAsync(seed, x: 0.65, y: 4.0);
        var idle = await SeedRobotAsync(seed);
        var queue = await AddEndpointAsync(seed, "EP-QUEUE-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), EndpointType.WAYPOINT, 3.0, 1.0);

        var sent = await AutoReturnAsync(queue.Code);

        Assert.Equal(1, sent);
        await using var scope = Services.CreateAsyncScope();
        var intent = Assert.Single(await scope.ServiceProvider.GetRequiredService<FleetDbContext>().RobotPositioningIntents.ToListAsync());
        Assert.Equal((idle.Id, queue.Id), (intent.RobotId, intent.TargetEndpointId));
        Assert.NotEqual(park, intent.TargetEndpointId);
        Assert.NotEqual(parked.Id, intent.RobotId);
    }

    [Fact]
    public async Task With_parking_and_queue_point_taken_an_idle_robot_stays_where_it_is()
    {
        var seed = await SeedAsync();
        await AddParkAsync(seed, 0.5);
        await SeedRobotAsync(seed, x: 0.5, y: 4.0);
        var queue = await AddEndpointAsync(seed, "EP-QUEUE-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), EndpointType.WAYPOINT, 3.0, 1.0);
        await SeedRobotAsync(seed, x: 3.2, y: 1.0);  // on the queue point, 0.2 m off
        await SeedRobotAsync(seed, x: 2.0, y: 2.5);

        Assert.Equal(0, await AutoReturnAsync(queue.Code));
    }

    [Fact]
    public async Task A_robot_waiting_on_the_queue_point_stays_until_a_parking_place_frees_up()
    {
        var seed = await SeedAsync();
        var park = await AddParkAsync(seed, 0.5);
        var blocker = await SeedRobotAsync(seed, x: 0.5, y: 4.0);
        var queue = await AddEndpointAsync(seed, "EP-QUEUE-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), EndpointType.WAYPOINT, 3.0, 1.0);
        var waiting = await SeedRobotAsync(seed, x: 3.0, y: 1.0);

        Assert.Equal(0, await AutoReturnAsync(queue.Code));

        await using (var scope = Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var row = await db.Robots.SingleAsync(r => r.Id == blocker.Id);
            row.PoseX = 5.0;  // it drove off to a Job
            row.PoseY = 1.0;
            row.IsOnline = false;
            await db.SaveChangesAsync();
        }

        Assert.Equal(1, await AutoReturnAsync(queue.Code));
        await using var check = Services.CreateAsyncScope();
        var intent = Assert.Single(await check.ServiceProvider.GetRequiredService<FleetDbContext>().RobotPositioningIntents.ToListAsync());
        Assert.Equal((waiting.Id, park), (intent.RobotId, intent.TargetEndpointId));
    }

    [Fact]
    public async Task No_fallback_configured_means_the_robot_stays_when_parking_is_full()
    {
        var seed = await SeedAsync();
        await AddParkAsync(seed, 0.5);
        await SeedRobotAsync(seed, x: 0.5, y: 4.0);
        await AddEndpointAsync(seed, "EP-QUEUE-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), EndpointType.WAYPOINT, 3.0, 1.0);
        await SeedRobotAsync(seed);

        Assert.Equal(0, await AutoReturnAsync(string.Empty));
    }

    // ------------------------------------------------------------------ helpers

    private async Task<T> Positioning<T>(Func<RobotPositioningService, Task<T>> act)
    {
        await using var scope = Services.CreateAsyncScope();
        return await act(scope.ServiceProvider.GetRequiredService<RobotPositioningService>());
    }

    private async Task Engine(Func<JobExecutionEngine, Task> act)
    {
        await using var scope = Services.CreateAsyncScope();
        await act(scope.ServiceProvider.GetRequiredService<JobExecutionEngine>());
    }

    private static async Task<string?> Try(Func<Task> act)
    {
        try
        {
            await act();
            return null;
        }
        catch (AppException refused)
        {
            return refused.Code;
        }
    }

    private async Task<int> AutoReturnAsync(string fallbackCodes = "")
    {
        await using var scope = Services.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var care = ActivatorUtilities.CreateInstance<RobotCareService>(
            sp, Options.Create(new FleetIdleOptions { AutoReturnToPark = true, IdleSeconds = 0, FallbackEndpointCodes = fallbackCodes }));
        return await care.ReturnIdleRobotsAsync(CancellationToken.None);
    }

    private async Task<Guid> NavigateIdAsync(Guid intentId)
    {
        await using var scope = Services.CreateAsyncScope();
        return (await scope.ServiceProvider.GetRequiredService<FleetDbContext>().RobotPositioningIntents.SingleAsync(i => i.Id == intentId))
            .NavigateCommandId!.Value;
    }

    private async Task ResultAsync(string robotCode, Guid commandId, string outcome)
    {
        await using var scope = Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<ProcessRobotCommandResultHandler>().HandleAsync(new RobotCommandResultMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            CommandId = commandId,
            RobotCode = robotCode,
            Outcome = outcome,
            SentAt = DateTimeOffset.UtcNow
        }, CancellationToken.None);
    }

    private async Task<WaroTrans.WorkflowExecution.Entities.JobStep> FirstMoveAsync(Guid jobId)
    {
        await using var scope = Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>().JobSteps.AsNoTracking()
            .Where(s => s.JobTask.JobId == jobId && s.StepType == StepType.MOVE)
            .OrderBy(s => s.JobTask.SequenceNo).ThenBy(s => s.SequenceNo)
            .FirstAsync();
    }

    private Task<TransportRequestScenario.Seed> SeedAsync() =>
        TransportRequestScenario.SeedAsync(Factory.Services, Client, "CTN-" + Guid.NewGuid().ToString("N")[..8]);

    private async Task<Guid> AddParkAsync(TransportRequestScenario.Seed seed, double x)
    {
        // The map is published: endpoints are added straight to the table, as a fixture.
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NavigationDbContext>();
        var endpoint = new NavEndpoint
        {
            Id = Guid.NewGuid(),
            MapVersionId = seed.MapVersionId,
            Code = "EP-PARK-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            Name = "Park",
            EndpointType = EndpointType.PARK,
            X = x,
            Y = 4.0,
            Yaw = Math.PI,
            PositionTolerance = 0.15,
            YawTolerance = 0.2,
            IsEnabled = true
        };
        db.Endpoints.Add(endpoint);
        await db.SaveChangesAsync();
        return endpoint.Id;
    }

    private async Task<NavEndpoint> AddEndpointAsync(TransportRequestScenario.Seed seed, string code, EndpointType type, double x, double y)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NavigationDbContext>();
        var endpoint = new NavEndpoint
        {
            Id = Guid.NewGuid(),
            MapVersionId = seed.MapVersionId,
            Code = code,
            Name = code,
            EndpointType = type,
            X = x,
            Y = y,
            Yaw = -Math.PI / 2,
            PositionTolerance = 0.06,
            YawTolerance = 0.2,
            IsEnabled = true
        };
        db.Endpoints.Add(endpoint);
        await db.SaveChangesAsync();
        return endpoint;
    }

    private async Task<Robot> SeedRobotAsync(TransportRequestScenario.Seed seed, bool online = true, double x = 2.0, double y = 1.0)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var now = DateTimeOffset.UtcNow;
        var robot = Robot.Register(seed.WarehouseId, seed.MapVersionId, "RBT-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), "R", now);
        robot.IsOnline = online;
        robot.Status = RobotStatus.AVAILABLE;
        robot.LocalizationStatus = LocalizationStatus.LOCALIZED;
        robot.LastHeartbeatAt = now;
        robot.LastTelemetryAt = now;
        robot.PoseX = x;
        robot.PoseY = y;
        robot.BatteryPercent = 90m;
        robot.BatteryMeasuredAt = now;
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot;
    }
}

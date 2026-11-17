using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.ProcessRobotTelemetry;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Services;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Fleet.PoseHistory;

/// <summary>FE-09 / FE-19 / SDD 3.3: telemetry becomes movement history, read back by robot, time range or Job.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class RobotPoseHistoryTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private sealed record PointDto(DateTimeOffset At, double X, double Y, double Yaw, double? LinearVelocity, string? MapVersionCode, Guid? JobId);

    private sealed record HistoryDto(Guid RobotId, DateTimeOffset? From, DateTimeOffset? To, Guid? JobId, int Total, bool Downsampled,
        double DistanceMeters, DateTimeOffset KeptSince, List<PointDto> Points);

    private async Task<Robot> SeedRobotAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var code = ("RBT-" + Guid.NewGuid().ToString("N")[..8]).ToUpperInvariant();
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), code, "Pose bot", DateTimeOffset.UtcNow);
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot;
    }

    private async Task<Guid> AssignJobAsync(Guid robotId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var jobId = Guid.NewGuid();
        db.JobAssignments.Add(new JobAssignment
        {
            Id = Guid.NewGuid(), JobId = jobId, RobotId = robotId, Status = JobAssignmentStatus.ACTIVE,
            AssignedAt = DateTimeOffset.UtcNow, ActivatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
        return jobId;
    }

    private async Task EndJobAsync(Guid robotId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        await db.JobAssignments.Where(a => a.RobotId == robotId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(a => a.Status, JobAssignmentStatus.ENDED)
                .SetProperty(a => a.EndedAt, DateTimeOffset.UtcNow));
    }

    /// <summary>Sends telemetry of one robot through the in-process handler, as the MQTT ingress does.</summary>
    private sealed class Telemetry(WaroTransWebApplicationFactory factory, string robotCode)
    {
        private readonly Guid boot = Guid.NewGuid();
        private long sequence;

        public async Task SendAsync(double x, double y, double v = 0.2, string localization = "LOCALIZED")
        {
            await using var scope = factory.Services.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<ProcessRobotTelemetryHandler>().HandleAsync(new RobotTelemetryMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                RobotCode = robotCode,
                BootId = boot,
                Sequence = ++sequence,
                SentAt = DateTimeOffset.UtcNow,
                MapVersionCode = "MAP-POSE-V001",
                Pose = new RobotPoseMessage { X = x, Y = y, Yaw = 0 },
                BatteryPercent = 80m,
                NavigationStatus = v == 0 ? "IDLE" : "NAVIGATING",
                LocalizationStatus = localization,
                LinearVelocity = v,
                AngularVelocity = 0
            }, CancellationToken.None);
        }
    }

    private async Task<HistoryDto> HistoryAsync(Guid robotId, string query = "")
    {
        var response = await Client.GetAsync($"/api/fleet/robots/{robotId}/pose-history{query}");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<HistoryDto>())!;
    }

    private async Task SeedSamplesAsync(Guid robotId, IEnumerable<(double X, double Y, DateTimeOffset At)> points)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        db.RobotPoseSamples.AddRange(points.Select(p => new RobotPoseSample
        {
            Id = Guid.NewGuid(), RobotId = robotId, X = p.X, Y = p.Y, MapVersionCode = "MAP-POSE-V001", RecordedAt = p.At
        }));
        await db.SaveChangesAsync();
    }

    private static string Iso(DateTimeOffset at) => Uri.EscapeDataString(at.ToString("O"));

    [Fact]
    public async Task Telemetry_keeps_a_point_every_quarter_metre_and_where_the_robot_stops()
    {
        var robot = await SeedRobotAsync();
        var telemetry = new Telemetry(Factory, robot.Code);

        for (var i = 0; i <= 10; i++)
        {
            await telemetry.SendAsync(i * 0.1, 0);                         // 0 … 1.0 m, moving
        }

        await telemetry.SendAsync(1.0, 0, v: 0);                           // stops
        await telemetry.SendAsync(1.0, 0, v: 0);                           // standing: nothing
        await telemetry.SendAsync(5.0, 5.0, localization: "LOST");         // pose not trusted: nothing

        var history = await HistoryAsync(robot.Id);

        Assert.Equal([0.0, 0.3, 0.6, 0.9, 1.0], history.Points.Select(p => Math.Round(p.X, 2)));
        Assert.All(history.Points, p => Assert.Equal("MAP-POSE-V001", p.MapVersionCode));
        Assert.Equal(1.0, history.DistanceMeters, 2);
        Assert.False(history.Downsampled);
    }

    [Fact]
    public async Task Points_carry_the_job_and_can_be_read_for_that_job_only()
    {
        var robot = await SeedRobotAsync();
        var telemetry = new Telemetry(Factory, robot.Code);
        await telemetry.SendAsync(0, 0);                                   // before the job
        var jobId = await AssignJobAsync(robot.Id);
        await telemetry.SendAsync(1, 0);
        await telemetry.SendAsync(2, 0);
        await EndJobAsync(robot.Id);
        await telemetry.SendAsync(3, 0);                                   // after it

        var all = await HistoryAsync(robot.Id);
        var job = await HistoryAsync(robot.Id, $"?jobId={jobId}");

        Assert.Equal([null, jobId, jobId, null], all.Points.Select(p => p.JobId));
        Assert.Equal([1.0, 2.0], job.Points.Select(p => p.X));
        Assert.Equal(jobId, job.JobId);
        Assert.Equal(1.0, job.DistanceMeters, 2);
    }

    [Fact]
    public async Task Many_points_are_thinned_out_but_the_distance_counts_them_all()
    {
        var robot = await SeedRobotAsync();
        var start = DateTimeOffset.UtcNow.AddMinutes(-30);
        await SeedSamplesAsync(robot.Id, Enumerable.Range(0, 50).Select(i => (i * 0.5, 0.0, start.AddSeconds(i))));

        var history = await HistoryAsync(robot.Id, "?limit=10");

        Assert.Equal(50, history.Total);
        Assert.True(history.Downsampled);
        Assert.Equal(10, history.Points.Count);
        Assert.Equal(0.0, history.Points[0].X);
        Assert.Equal(24.5, history.Points[^1].X);
        Assert.Equal(24.5, history.DistanceMeters, 2);
    }

    [Fact]
    public async Task The_range_is_bounded_and_validated()
    {
        var robot = await SeedRobotAsync();
        await SeedSamplesAsync(robot.Id, [(1, 1, DateTimeOffset.UtcNow.AddHours(-3))]);

        Assert.Empty((await HistoryAsync(robot.Id)).Points);               // default: the last hour
        Assert.Single((await HistoryAsync(robot.Id, $"?from={Iso(DateTimeOffset.UtcNow.AddHours(-4))}")).Points);

        var url = $"/api/fleet/robots/{robot.Id}/pose-history";
        var tooLong = await Client.GetAsync($"{url}?from={Iso(DateTimeOffset.UtcNow.AddDays(-8))}");
        var backwards = await Client.GetAsync($"{url}?from={Iso(DateTimeOffset.UtcNow)}&to={Iso(DateTimeOffset.UtcNow.AddHours(-1))}");
        var badLimit = await Client.GetAsync($"{url}?limit=1");
        var unknown = await Client.GetAsync($"/api/fleet/robots/{Guid.NewGuid()}/pose-history");

        Assert.Equal("pose_history_range_too_long", await tooLong.ReadErrorCodeAsync());
        Assert.Equal("pose_history_range_invalid", await backwards.ReadErrorCodeAsync());
        Assert.Equal("pose_history_limit_invalid", await badLimit.ReadErrorCodeAsync());
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    [Fact]
    public async Task Old_points_are_deleted_after_the_retention_period()
    {
        var robot = await SeedRobotAsync();
        var now = DateTimeOffset.UtcNow;
        await SeedSamplesAsync(robot.Id, [(1, 1, now.AddDays(-8)), (2, 2, now.AddDays(-6))]);

        var sweeper = Factory.Services.GetServices<IHostedService>().OfType<RobotHistoryRetentionHostedService>().Single();
        await sweeper.SweepAsync(CancellationToken.None);

        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        Assert.Equal([2.0], await db.RobotPoseSamples.Where(p => p.RobotId == robot.Id).Select(p => p.X).ToListAsync());
    }
}

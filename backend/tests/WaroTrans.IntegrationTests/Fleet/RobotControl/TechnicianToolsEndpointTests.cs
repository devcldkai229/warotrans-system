using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.IntegrationTests.Fleet.RobotControl;

/// <summary>Technician tools: technical tickets, emergency stop with cleared commands, restarts of one stack.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class TechnicianToolsEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private async Task<Guid> SeedRobotAsync(Action<Robot>? change = null)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), "R", DateTimeOffset.UtcNow);
        robot.IsOnline = true;
        robot.LastHeartbeatAt = DateTimeOffset.UtcNow.AddHours(1);
        robot.Status = RobotStatus.AVAILABLE;
        change?.Invoke(robot);
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot.Id;
    }

    /// <summary>A Technician assigned to these robots only.</summary>
    private async Task<(HttpClient Client, SessionDto Session)> SignInTechnicianAsync(string username, params Guid[] robotIds)
    {
        var tech = await Factory.CreateAccountAsync(username, AccountRole.TECHNICIAN);
        await Factory.CreateAccountAsync(username + "-boss", AccountRole.ADMIN);
        var client = CreateAnonymousClient();
        var admin = await client.LoginAsync(username + "-boss");
        using var scope = await client.SendWithTokenAsync(HttpMethod.Put, $"/api/identity/accounts/{tech.Id}/robot-scope", admin.AccessToken,
            new { robotIds });
        Assert.True(scope.IsSuccessStatusCode, await scope.Content.ReadAsStringAsync());
        return (client, await client.LoginAsync(username));
    }

    private CapturingMqttRobotCommandPublisher Mqtt => Factory.Services.GetRequiredService<CapturingMqttRobotCommandPublisher>();

    [Fact]
    public async Task A_ticket_is_opened_logged_and_completed_and_appears_in_the_robot_history()
    {
        var robotId = await SeedRobotAsync(r => r.BatteryPercent = 64);

        var created = await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/tickets",
            new { type = "DIAGNOSTIC", title = "Lidar stale", description = "scan stops after a bump" });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var ticket = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = ticket.GetProperty("id").GetGuid();
        Assert.Matches(@"^TK-\d{6}-\d{3}$", ticket.GetProperty("ticketNo").GetString());
        Assert.Equal("OPEN", ticket.GetProperty("status").GetString());
        Assert.Equal(64, ticket.GetProperty("snapshot").GetProperty("batteryPercent").GetDecimal());

        Assert.Equal(HttpStatusCode.OK, (await Client.PostAsJsonAsync($"/api/fleet/tickets/{id}/actions", new { text = "cleaned the window" })).StatusCode);
        var patch = await Client.PatchAsJsonAsync($"/api/fleet/tickets/{id}",
            new { checklist = new[] { new { item = "Fault reproduced", ok = true } } });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);

        var done = await Client.PostAsJsonAsync($"/api/fleet/tickets/{id}/complete", new { result = "FIXED", findings = "dust on the window" });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        var closed = await done.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("COMPLETED", closed.GetProperty("status").GetString());
        Assert.Equal("FIXED", closed.GetProperty("result").GetString());
        Assert.Equal("cleaned the window", Assert.Single(closed.GetProperty("actions").EnumerateArray()).GetProperty("text").GetString());
        Assert.True(Assert.Single(closed.GetProperty("checklist").EnumerateArray()).GetProperty("ok").GetBoolean());

        var again = await Client.PostAsJsonAsync($"/api/fleet/tickets/{id}/actions", new { text = "late" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("ticket_not_open", await again.ReadErrorCodeAsync());

        var list = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/tickets?robotId={robotId}");
        Assert.Equal(1, list.GetProperty("total").GetInt32());

        var history = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/robots/{robotId}/state-history?kind=TICKET");
        var line = Assert.Single(history.GetProperty("items").EnumerateArray());
        Assert.Equal("TICKET", line.GetProperty("kind").GetString());
        Assert.Equal("Lidar stale", line.GetProperty("ticketTitle").GetString());
    }

    [Fact]
    public async Task A_maintenance_session_opens_its_ticket_and_closes_it_with_the_checklist()
    {
        var robotId = await SeedRobotAsync();
        Assert.Equal(HttpStatusCode.OK, (await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/maintenance/start", new { reason = "wheel noise" })).StatusCode);

        var open = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/tickets?robotId={robotId}&status=OPEN");
        var ticket = Assert.Single(open.GetProperty("items").EnumerateArray());
        Assert.Equal("MAINTENANCE", ticket.GetProperty("type").GetString());
        var id = ticket.GetProperty("id").GetGuid();

        // Its own close is refused: it closes with the return to service.
        var early = await Client.PostAsJsonAsync($"/api/fleet/tickets/{id}/complete", new { result = "PASSED" });
        Assert.Equal("ticket_closed_by_maintenance", await early.ReadErrorCodeAsync());
        Assert.Equal(HttpStatusCode.OK, (await Client.PostAsJsonAsync($"/api/fleet/tickets/{id}/actions", new { text = "bearing replaced" })).StatusCode);

        var done = await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/maintenance/complete",
            new { sensorsOk = true, localizationOk = true, stopTestOk = true, trafficClear = true, notes = "ok after test drive" });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);

        var closed = await Client.GetFromJsonAsync<JsonElement>($"/api/fleet/tickets/{id}");
        Assert.Equal("COMPLETED", closed.GetProperty("status").GetString());
        Assert.Equal("PASSED", closed.GetProperty("result").GetString());
        Assert.Equal(4, closed.GetProperty("checklist").GetArrayLength());
        Assert.Contains("ok after test drive", closed.GetProperty("findings").GetString());
    }

    [Fact]
    public async Task A_technician_sees_only_the_tickets_of_their_robots()
    {
        var mine = await SeedRobotAsync();
        var other = await SeedRobotAsync();
        var created = await Client.PostAsJsonAsync($"/api/fleet/robots/{other}/tickets", new { type = "INSPECTION", title = "not yours" });
        var otherTicket = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var (client, tech) = await SignInTechnicianAsync("tick-tech", mine);

        var list = await client.SendWithTokenAsync(HttpMethod.Get, $"/api/fleet/tickets?robotId={other}", tech.AccessToken);
        Assert.Equal(0, (await list.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("total").GetInt32());
        var one = await client.SendWithTokenAsync(HttpMethod.Get, $"/api/fleet/tickets/{otherTicket}", tech.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound, one.StatusCode);
        var create = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{other}/tickets", tech.AccessToken,
            new { type = "INSPECTION", title = "x" });
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
        var own = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/fleet/robots/{mine}/tickets", tech.AccessToken,
            new { type = "INSPECTION", title = "weekly check" });
        Assert.Equal(HttpStatusCode.OK, own.StatusCode);
    }

    [Fact]
    public async Task Emergency_stop_holds_the_robot_pauses_its_job_and_clears_its_commands()
    {
        var robotId = await SeedRobotAsync(r => r.Status = RobotStatus.EXECUTING);
        var now = DateTimeOffset.UtcNow;
        Guid moveId = Guid.NewGuid();
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var fleet = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            fleet.RobotCommands.Add(new WaroTrans.Fleet.Entities.RobotCommand
            {
                Id = moveId, RobotId = robotId, Type = RobotCommandType.NAVIGATE_TO_POSE, Status = RobotCommandStatus.RUNNING,
                PayloadJson = "{\"x\":1,\"y\":2,\"yaw\":0}", IssuedAt = now
            });
            var robot = await fleet.Robots.FirstAsync(r => r.Id == robotId);
            robot.CurrentCommandId = moveId;
            await fleet.SaveChangesAsync();

            var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            var job = new Job
            {
                Id = Guid.NewGuid(), JobNo = "JOB-ESTOP-" + Guid.NewGuid().ToString("N")[..4], ProvisioningKey = Guid.NewGuid().ToString("N"),
                WorkflowId = Guid.NewGuid(), MapVersionId = Guid.NewGuid(), Status = JobStatus.RUNNING, CreatedAt = now
            };
            execution.Jobs.Add(job);
            execution.JobRobotAssignments.Add(new JobRobotAssignment { Id = Guid.NewGuid(), JobId = job.Id, RobotId = robotId, StartedAt = now });
            await execution.SaveChangesAsync();
        }

        var (client, tech) = await SignInTechnicianAsync("estop-tech", robotId);
        var stop = await client.SendWithTokenAsync(HttpMethod.Post, $"/api/workflow-execution/robots/{robotId}/emergency-stop", tech.AccessToken,
            new { reason = "box about to fall" });
        Assert.Equal(HttpStatusCode.OK, stop.StatusCode);
        var result = await stop.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(result.GetProperty("robotOnline").GetBoolean());
        Assert.Single(result.GetProperty("pausedJobs").EnumerateArray());
        Assert.True(result.GetProperty("clearedCommands").GetInt32() >= 1);
        Assert.Contains(Mqtt.Published, m => m.Type == "STOP" && m.Payload.GetProperty("reason").GetString() == "box about to fall");

        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var fleet = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var move = await fleet.RobotCommands.AsNoTracking().FirstAsync(c => c.Id == moveId);
            Assert.Equal(RobotCommandStatus.CANCELED, move.Status);
            Assert.Equal("EMERGENCY_STOP", move.ErrorCode);
            Assert.Null((await fleet.Robots.AsNoTracking().FirstAsync(r => r.Id == robotId)).CurrentCommandId);
            var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            var job = await execution.JobRobotAssignments.AsNoTracking().Where(a => a.RobotId == robotId).Select(a => a.Job).FirstAsync();
            Assert.Equal(JobStatus.PAUSED, job.Status);
        }
    }

    [Fact]
    public async Task Restarting_nav2_needs_no_typed_code_but_rebooting_does()
    {
        var robotId = await SeedRobotAsync(r =>
        {
            r.Capabilities = "RESTART_NAV,REBOOT";
            r.MotionHeld = true;
        });

        var nav = await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/system-actions", new { action = "RESTART_NAV" });
        Assert.Equal(HttpStatusCode.Accepted, nav.StatusCode);
        Assert.Contains(Mqtt.Published, m => m.Type == "SYSTEM_ACTION" && m.Payload.GetProperty("action").GetString() == "RESTART_NAV");

        var reboot = await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/system-actions", new { action = "REBOOT" });
        Assert.Equal("system_action_not_confirmed", await reboot.ReadErrorCodeAsync());
        var camera = await Client.PostAsJsonAsync($"/api/fleet/robots/{robotId}/system-actions", new { action = "RESTART_CAMERA" });
        Assert.Equal("robot_capability_unsupported", await camera.ReadErrorCodeAsync());
    }
}

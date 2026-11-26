using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Identity;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.IntegrationTests.WorkflowExecution.Recovery;

/// <summary>Payload recovery, the technician's part: assess, locate, secure — permission and robot scope enforced.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class PayloadRecoveryEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Root = "/api/workflow-execution/jobs";

    private async Task<Guid> SeedRobotAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), "R", DateTimeOffset.UtcNow);
        robot.IsOnline = true;
        robot.LastHeartbeatAt = DateTimeOffset.UtcNow.AddHours(1);
        robot.Status = RobotStatus.EXECUTING;
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot.Id;
    }

    /// <summary>A Job held in RECOVERY_REQUIRED with an open case for this robot (as OpenRecoveryAsync leaves it).</summary>
    private async Task<(Guid JobId, Guid CaseId)> SeedRecoveryAsync(Guid robotId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var now = DateTimeOffset.UtcNow;
        var job = new Job
        {
            Id = Guid.NewGuid(), JobNo = "JOB-PR-" + Guid.NewGuid().ToString("N")[..4], ProvisioningKey = Guid.NewGuid().ToString("N"),
            WorkflowId = Guid.NewGuid(), MapVersionId = Guid.NewGuid(), Status = JobStatus.RECOVERY_REQUIRED, CreatedAt = now,
            ContextValues = new Dictionary<string, JsonElement> { [JobExecutionEngine.AssignedRobotKey] = JsonSerializer.SerializeToElement(robotId) }
        };
        db.Jobs.Add(job);
        db.JobRobotAssignments.Add(new JobRobotAssignment { Id = Guid.NewGuid(), JobId = job.Id, RobotId = robotId, StartedAt = now });
        var recovery = new JobRecoveryCase
        {
            Id = Guid.NewGuid(), JobId = job.Id, FromRobotId = robotId, Status = JobRecoveryStatuses.Open, Reason = "robot_failed",
            ContainerIds = [Guid.NewGuid()], CreatedAt = now, Phase = RecoveryPhases.AssessmentRequired
        };
        db.JobRecoveryCases.Add(recovery);
        await db.SaveChangesAsync();
        return (job.Id, recovery.Id);
    }

    private async Task<(HttpClient Client, string Token)> SignInAsync(string username, AccountRole role, params Guid[] robotIds)
    {
        var account = await Factory.CreateAccountAsync(username, role);
        var client = CreateAnonymousClient();
        if (role == AccountRole.TECHNICIAN)
        {
            await Factory.CreateAccountAsync(username + "-boss", AccountRole.ADMIN);
            var admin = await client.LoginAsync(username + "-boss");
            using var grant = await client.SendWithTokenAsync(HttpMethod.Put, $"/api/identity/accounts/{account.Id}/robot-scope",
                admin.AccessToken, new { robotIds });
            Assert.True(grant.IsSuccessStatusCode, await grant.Content.ReadAsStringAsync());
        }

        return (client, (await client.LoginAsync(username)).AccessToken);
    }

    private static async Task<JsonElement> RecoveryAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("recovery");

    [Fact]
    public async Task A_technician_assesses_locates_and_secures_the_failed_robot_staff_may_not()
    {
        var robotId = await SeedRobotAsync();
        var (jobId, caseId) = await SeedRecoveryAsync(robotId);

        var (staffClient, staff) = await SignInAsync("pr-staff", AccountRole.STAFF);
        var refused = await staffClient.SendWithTokenAsync(HttpMethod.Post, $"{Root}/{jobId}/recovery/assessment", staff,
            new { caseId, version = 0, result = "MANUAL_RECOVERY_REQUIRED" });
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);

        var (otherClient, other) = await SignInAsync("pr-tech-other", AccountRole.TECHNICIAN, await SeedRobotAsync());
        var outOfScope = await otherClient.SendWithTokenAsync(HttpMethod.Post, $"{Root}/{jobId}/recovery/assessment", other,
            new { caseId, version = 0, result = "MANUAL_RECOVERY_REQUIRED" });
        Assert.Equal(HttpStatusCode.Forbidden, outOfScope.StatusCode);

        var (client, tech) = await SignInAsync("pr-tech", AccountRole.TECHNICIAN, robotId);
        var assessed = await client.SendWithTokenAsync(HttpMethod.Post, $"{Root}/{jobId}/recovery/assessment", tech,
            new { caseId, version = 0, result = "MANUAL_RECOVERY_REQUIRED", checklist = Array.Empty<object>(), note = "no power" });
        Assert.True(assessed.IsSuccessStatusCode, await assessed.Content.ReadAsStringAsync());
        var after = await RecoveryAsync(assessed);
        Assert.Equal("ASSESSED", after.GetProperty("phase").GetString());
        Assert.Equal("MANUAL", after.GetProperty("recoveryMode").GetString());
        var actions = after.GetProperty("availableActions").EnumerateArray()
            .ToDictionary(a => a.GetProperty("action").GetString()!, a => a);
        Assert.False(actions["SOURCE_EVACUATE"].GetProperty("allowed").GetBoolean());

        // Stale version is refused.
        var stale = await client.SendWithTokenAsync(HttpMethod.Post, $"{Root}/{jobId}/recovery/verify-location", tech,
            new { caseId, version = 0, x = 1.0, y = 2.0 });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("recovery_case_changed", await stale.ReadErrorCodeAsync());

        var located = await client.SendWithTokenAsync(HttpMethod.Post, $"{Root}/{jobId}/recovery/verify-location", tech,
            new { caseId, version = 1, x = 1.0, y = 2.0 });
        Assert.True(located.IsSuccessStatusCode, await located.Content.ReadAsStringAsync());

        var secured = await client.SendWithTokenAsync(HttpMethod.Post, $"{Root}/{jobId}/recovery/source-secure", tech,
            new { caseId, version = 2, note = "pushed aside" });
        Assert.True(secured.IsSuccessStatusCode, await secured.Content.ReadAsStringAsync());
        var done = await RecoveryAsync(secured);
        Assert.Equal("SOURCE_SECURED", done.GetProperty("phase").GetString());
        Assert.NotEqual(JsonValueKind.Null, done.GetProperty("sourceSecuredAt").ValueKind);
    }

    [Fact]
    public async Task Asking_for_recovery_needs_job_operate_or_the_assess_right()
    {
        var robotId = await SeedRobotAsync();
        var (jobId, _) = await SeedRecoveryAsync(robotId);
        var (client, tech) = await SignInAsync("pr-req-tech", AccountRole.TECHNICIAN, robotId);

        // Already in recovery: answers with the open case (idempotent).
        var asked = await client.SendWithTokenAsync(HttpMethod.Post, $"{Root}/{jobId}/recovery/request", tech, new { reason = "help" });
        Assert.True(asked.IsSuccessStatusCode, await asked.Content.ReadAsStringAsync());
        Assert.Equal("ASSESSMENT_REQUIRED", (await RecoveryAsync(asked)).GetProperty("phase").GetString());
    }
}

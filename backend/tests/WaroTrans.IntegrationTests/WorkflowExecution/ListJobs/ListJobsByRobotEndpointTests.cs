using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.IntegrationTests.WorkflowExecution.ListJobs;

/// <summary>GET /jobs?robotId= — the robot detail page's "recent jobs", read from Fleet's job assignments.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class ListJobsByRobotEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record JobRow(Guid Id, string JobNo, string Status);

    private sealed record JobList(IReadOnlyList<JobRow> Items, int Total);

    private static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-05-01T08:00:00Z");

    private async Task<(Guid RobotA, Guid RobotB, Job Old, Job HandedOver, Job OnlyB, Job Failed)> SeedAsync()
    {
        var workflowId = Guid.NewGuid();
        Job NewJob(string no, JobStatus status, int minutes) => new()
        {
            Id = Guid.NewGuid(),
            JobNo = no,
            WorkflowId = workflowId,
            MapVersionId = Guid.NewGuid(),
            ProvisioningKey = Guid.NewGuid().ToString("N"),
            Status = status,
            CreatedAt = T0.AddMinutes(minutes)
        };

        var old = NewJob("JOB-R-OLD", JobStatus.COMPLETED, 0);
        var handedOver = NewJob("JOB-R-HANDOVER", JobStatus.COMPLETED, 10);
        var onlyB = NewJob("JOB-R-ONLY-B", JobStatus.RUNNING, 20);
        var failed = NewJob("JOB-R-FAILED", JobStatus.FAILED, 30);

        await using var scope = Factory.Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        execution.Workflows.Add(new Workflow
        {
            Id = workflowId, Code = "WF_ROBOT_JOBS", VersionNo = 1, Name = "Robot jobs", Status = WorkflowStatus.PUBLISHED,
            CreatedBy = Guid.NewGuid(), CreatedAt = T0
        });
        execution.Jobs.AddRange(old, handedOver, onlyB, failed);
        await execution.SaveChangesAsync();

        var fleet = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robotA = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RJ-A", "Robot A", T0);
        var robotB = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RJ-B", "Robot B", T0);
        fleet.Robots.AddRange(robotA, robotB);
        // A robot and a Job hold one open assignment at a time, so the earlier ones are ended.
        JobAssignment Ended(Job job, Robot robot, int minutes, AssignmentEndReason reason)
        {
            var assignment = JobAssignment.CreatePending(job.Id, robot.Id, T0.AddMinutes(minutes));
            assignment.TryEnd(reason, T0.AddMinutes(minutes + 3));
            return assignment;
        }

        fleet.JobAssignments.AddRange(
            Ended(old, robotA, 1, AssignmentEndReason.COMPLETED),
            Ended(handedOver, robotA, 11, AssignmentEndReason.REASSIGNED),
            Ended(handedOver, robotB, 15, AssignmentEndReason.COMPLETED),
            JobAssignment.CreatePending(onlyB.Id, robotB.Id, T0.AddMinutes(21)),
            JobAssignment.CreatePending(failed.Id, robotA.Id, T0.AddMinutes(31)));
        await fleet.SaveChangesAsync();

        return (robotA.Id, robotB.Id, old, handedOver, onlyB, failed);
    }

    private async Task<JobList> ListAsync(string query)
    {
        var response = await Client.GetAsync($"/api/workflow-execution/jobs?{query}");
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<JobList>(JsonOptions))!;
    }

    [Fact]
    public async Task Robot_filter_returns_the_jobs_that_robot_ran_newest_first()
    {
        var (robotA, robotB, old, handedOver, onlyB, failed) = await SeedAsync();

        var ofA = await ListAsync($"robotId={robotA}");
        var ofB = await ListAsync($"robotId={robotB}");

        Assert.Equal([failed.JobNo, handedOver.JobNo, old.JobNo], ofA.Items.Select(j => j.JobNo));
        Assert.Equal(3, ofA.Total);
        // A Job handed over to another robot shows for both robots.
        Assert.Equal([onlyB.JobNo, handedOver.JobNo], ofB.Items.Select(j => j.JobNo));
    }

    [Fact]
    public async Task Take_keeps_the_most_recently_assigned_jobs()
    {
        var (robotA, _, _, handedOver, _, failed) = await SeedAsync();

        var latestTwo = await ListAsync($"robotId={robotA}&take=2");

        Assert.Equal([failed.JobNo, handedOver.JobNo], latestTwo.Items.Select(j => j.JobNo));
    }

    [Fact]
    public async Task An_assignment_whose_job_was_deleted_does_not_eat_into_take()
    {
        var (robotA, _, _, handedOver, _, failed) = await SeedAsync();
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            // Newest assignment of robot A points at a Job that no longer exists (e.g. a demo reseed deleted it).
            var fleet = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var orphan = JobAssignment.CreatePending(Guid.NewGuid(), robotA, T0.AddMinutes(40));
            orphan.TryEnd(AssignmentEndReason.COMPLETED, T0.AddMinutes(41));
            fleet.JobAssignments.Add(orphan);
            await fleet.SaveChangesAsync();
        }

        var latestTwo = await ListAsync($"robotId={robotA}&take=2");

        Assert.Equal([failed.JobNo, handedOver.JobNo], latestTwo.Items.Select(j => j.JobNo));
    }

    [Fact]
    public async Task Robot_filter_combines_with_the_status_filter()
    {
        var (robotA, _, _, _, _, failed) = await SeedAsync();

        var failedOfA = await ListAsync($"robotId={robotA}&status=FAILED");

        Assert.Equal([failed.JobNo], failedOfA.Items.Select(j => j.JobNo));
    }

    [Fact]
    public async Task Unknown_robot_has_no_jobs_and_no_filter_still_lists_every_job()
    {
        await SeedAsync();

        var unknown = await ListAsync($"robotId={Guid.NewGuid()}");
        var all = await ListAsync("take=50");

        Assert.Empty(unknown.Items);
        Assert.Equal(0, unknown.Total);
        Assert.Equal(4, all.Total);
    }
}

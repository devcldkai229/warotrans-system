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

/// <summary>WEB-FLEET-07: the Jobs page searches by Job number or id and pages through the list.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class ListJobsSearchAndPagingEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-06-01T08:00:00Z");

    private sealed record JobRow(Guid Id, string JobNo, string Status);

    private sealed record JobList(IReadOnlyList<JobRow> Items, int Total);

    private async Task<List<Job>> SeedJobsAsync(params (string No, JobStatus Status)[] jobs)
    {
        var workflowId = Guid.NewGuid();
        var created = jobs.Select((j, i) => new Job
        {
            Id = Guid.NewGuid(),
            JobNo = j.No,
            WorkflowId = workflowId,
            MapVersionId = Guid.NewGuid(),
            ProvisioningKey = Guid.NewGuid().ToString("N"),
            Status = j.Status,
            CreatedAt = T0.AddMinutes(i)
        }).ToList();

        await using var scope = Factory.Services.CreateAsyncScope();
        var execution = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        execution.Workflows.Add(new Workflow
        {
            Id = workflowId, Code = $"WF_{Guid.NewGuid():N}"[..20], VersionNo = 1, Name = "Search jobs", Status = WorkflowStatus.PUBLISHED,
            CreatedBy = Guid.NewGuid(), CreatedAt = T0
        });
        execution.Jobs.AddRange(created);
        await execution.SaveChangesAsync();
        return created;
    }

    private async Task<JobList> ListAsync(string query)
    {
        var response = await Client.GetAsync($"/api/workflow-execution/jobs?{query}");
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<JobList>(JsonOptions))!;
    }

    [Fact]
    public async Task Search_matches_part_of_the_job_number_whatever_its_case_and_counts_only_matches()
    {
        await SeedJobsAsync(("JOB-S-ALPHA-1", JobStatus.COMPLETED), ("JOB-S-ALPHA-2", JobStatus.FAILED), ("JOB-S-BRAVO-1", JobStatus.RUNNING));

        var alpha = await ListAsync("search=alpha");
        var bravo = await ListAsync("search=%20S-BRAVO%20");

        Assert.Equal(["JOB-S-ALPHA-2", "JOB-S-ALPHA-1"], alpha.Items.Select(j => j.JobNo));
        Assert.Equal(2, alpha.Total);
        Assert.Equal(["JOB-S-BRAVO-1"], bravo.Items.Select(j => j.JobNo));
        Assert.Equal(0, (await ListAsync("search=nothing-like-this")).Total);
    }

    [Fact]
    public async Task Search_finds_a_job_by_its_exact_id_and_combines_with_the_status_filter()
    {
        var jobs = await SeedJobsAsync(("JOB-S-ONE", JobStatus.COMPLETED), ("JOB-S-TWO", JobStatus.FAILED));

        var byId = await ListAsync($"search={jobs[1].Id}");
        var idWithWrongStatus = await ListAsync($"search={jobs[1].Id}&status=COMPLETED");
        var failedWithTerm = await ListAsync("search=JOB-S&status=FAILED");

        Assert.Equal(["JOB-S-TWO"], byId.Items.Select(j => j.JobNo));
        Assert.Empty(idWithWrongStatus.Items);
        Assert.Equal(["JOB-S-TWO"], failedWithTerm.Items.Select(j => j.JobNo));
    }

    [Fact]
    public async Task Skip_pages_through_the_list_newest_first_and_total_stays_the_full_count()
    {
        await SeedJobsAsync(
            ("JOB-P-1", JobStatus.COMPLETED), ("JOB-P-2", JobStatus.COMPLETED), ("JOB-P-3", JobStatus.COMPLETED),
            ("JOB-P-4", JobStatus.COMPLETED), ("JOB-P-5", JobStatus.COMPLETED));

        var first = await ListAsync("search=JOB-P&take=2");
        var second = await ListAsync("search=JOB-P&take=2&skip=2");
        var third = await ListAsync("search=JOB-P&take=2&skip=4");
        var beyond = await ListAsync("search=JOB-P&take=2&skip=40");

        Assert.Equal(["JOB-P-5", "JOB-P-4"], first.Items.Select(j => j.JobNo));
        Assert.Equal(["JOB-P-3", "JOB-P-2"], second.Items.Select(j => j.JobNo));
        Assert.Equal(["JOB-P-1"], third.Items.Select(j => j.JobNo));
        Assert.All(new[] { first, second, third, beyond }, page => Assert.Equal(5, page.Total));
        Assert.Empty(beyond.Items);
    }

    [Fact]
    public async Task Skip_also_works_on_a_robots_jobs()
    {
        var jobs = await SeedJobsAsync(("JOB-RP-1", JobStatus.COMPLETED), ("JOB-RP-2", JobStatus.COMPLETED), ("JOB-RP-3", JobStatus.COMPLETED));
        Guid robotId;
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var fleet = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RP-A", "Robot A", T0);
            fleet.Robots.Add(robot);
            for (var i = 0; i < jobs.Count; i++)
            {
                var assignment = JobAssignment.CreatePending(jobs[i].Id, robot.Id, T0.AddMinutes(i + 1));
                assignment.TryEnd(AssignmentEndReason.COMPLETED, T0.AddMinutes(i + 1).AddSeconds(30));
                fleet.JobAssignments.Add(assignment);
            }

            await fleet.SaveChangesAsync();
            robotId = robot.Id;
        }

        var first = await ListAsync($"robotId={robotId}&take=2");
        var second = await ListAsync($"robotId={robotId}&take=2&skip=2");

        Assert.Equal(["JOB-RP-3", "JOB-RP-2"], first.Items.Select(j => j.JobNo));
        Assert.Equal(["JOB-RP-1"], second.Items.Select(j => j.JobNo));
        Assert.Equal(3, second.Total);
    }
}

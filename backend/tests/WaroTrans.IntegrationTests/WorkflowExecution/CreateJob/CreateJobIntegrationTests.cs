using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.WorkflowExecution.CreateJob;

/// <summary>
/// Placeholder for Job Planning: 1 TransportRequest → N Jobs + JobContainer rows.
/// Job has no TransportRequestId; Request↔Job is via JobContainer only.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class CreateJobIntegrationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact(Skip = "Job Planning feature/API not implemented yet — expect N Jobs + JobContainers per TransportRequest")]
    public Task Planning_transport_request_persists_jobs_and_job_containers()
    {
        return Task.CompletedTask;
    }
}

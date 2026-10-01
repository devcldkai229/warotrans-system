using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.WorkflowExecution.CreateJob;

[Collection(IntegrationCollection.Name)]
public sealed class CreateJobIntegrationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact(Skip = "CreateJob feature/API not implemented yet")]
    public Task Creating_job_from_transport_request_persists_job()
    {
        return Task.CompletedTask;
    }
}

using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Warehouse.CreateContainer;

[Collection(IntegrationCollection.Name)]
public sealed class CreateContainerEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact(Skip = "CreateContainer Minimal API not implemented yet")]
    public Task Post_container_persists_created_container()
    {
        return Task.CompletedTask;
    }
}

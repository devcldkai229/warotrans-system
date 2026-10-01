using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Host.Health;

[Collection(IntegrationCollection.Name)]
public sealed class HealthEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Get_health_returns_success()
    {
        var response = await Client.GetAsync("/health");
        Assert.True(response.IsSuccessStatusCode, $"Expected success, got {(int)response.StatusCode}");
    }
}

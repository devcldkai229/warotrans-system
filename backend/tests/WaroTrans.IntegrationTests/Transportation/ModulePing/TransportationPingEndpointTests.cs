using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Transportation.ModulePing;

[Collection(IntegrationCollection.Name)]
public sealed class TransportationPingEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Get_transportation_ping_returns_ok()
    {
        var response = await Client.GetAsync("/api/transportation/ping");
        response.EnsureSuccessStatusCode();
    }
}

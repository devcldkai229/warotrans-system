using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Warehouse.ModulePing;

[Collection(IntegrationCollection.Name)]
public sealed class WarehousePingEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Get_warehouse_ping_returns_ok()
    {
        var response = await Client.GetAsync("/api/warehouse/ping");
        response.EnsureSuccessStatusCode();
    }
}

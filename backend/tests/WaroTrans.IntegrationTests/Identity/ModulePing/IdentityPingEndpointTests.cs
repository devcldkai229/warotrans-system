using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity.ModulePing;

[Collection(IntegrationCollection.Name)]
public sealed class IdentityPingEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Get_identity_ping_returns_ok()
    {
        var response = await Client.GetAsync("/api/identity/ping");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("identity", body, StringComparison.OrdinalIgnoreCase);
    }
}

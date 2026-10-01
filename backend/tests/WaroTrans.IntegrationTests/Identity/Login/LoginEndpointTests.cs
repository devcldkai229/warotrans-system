using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity.Login;

[Collection(IntegrationCollection.Name)]
public sealed class LoginEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact(Skip = "Login Minimal API not implemented yet")]
    public Task Post_login_returns_token()
    {
        return Task.CompletedTask;
    }
}

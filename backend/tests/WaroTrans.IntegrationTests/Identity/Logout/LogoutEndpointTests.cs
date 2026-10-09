using System.Net;
using System.Net.Http.Json;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity.Logout;

[Collection(IntegrationCollection.Name)]
public sealed class LogoutEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Post_logout_revokes_the_refresh_token()
    {
        await Factory.CreateAccountAsync("alice");
        var client = CreateAnonymousClient();
        var login = await client.LoginAsync("alice");

        var logout = await client.PostAsJsonAsync("/api/identity/logout", new { refreshToken = login.RefreshToken });

        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        var refresh = await client.PostRefreshAsync(login.RefreshToken);
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    [Fact]
    public async Task Post_logout_only_ends_the_session_it_was_called_for()
    {
        await Factory.CreateAccountAsync("alice");
        var client = CreateAnonymousClient();
        var phone = await client.LoginAsync("alice");
        var laptop = await client.LoginAsync("alice");

        await client.PostAsJsonAsync("/api/identity/logout", new { refreshToken = phone.RefreshToken });

        var refresh = await client.PostRefreshAsync(laptop.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
    }

    [Fact]
    public async Task Post_logout_with_cookie_transport_revokes_the_session_and_clears_the_cookie()
    {
        await Factory.CreateAccountAsync("alice");
        var client = CreateAnonymousClient();
        await client.PostLoginAsync("alice", useCookie: true);

        var logout = await client.PostAsync("/api/identity/logout", content: null);

        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        var cleared = Assert.Single(logout.Headers.GetValues("Set-Cookie"));
        Assert.StartsWith("warotrans_refresh=;", cleared);

        var refresh = await client.PostAsync("/api/identity/refresh", content: null);
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    [Fact]
    public async Task Post_logout_without_a_session_still_returns_204()
    {
        var response = await CreateAnonymousClient().PostAsync("/api/identity/logout", content: null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }
}

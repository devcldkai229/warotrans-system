using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Enums;
using WaroTrans.Identity.Persistence;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity.RefreshSession;

[Collection(IntegrationCollection.Name)]
public sealed class RefreshSessionEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Post_refresh_rotates_the_token_and_returns_a_working_access_token()
    {
        await Factory.CreateAccountAsync("alice");
        var client = CreateAnonymousClient();
        var login = await client.LoginAsync("alice");

        var response = await client.PostRefreshAsync(login.RefreshToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var refreshed = (await response.Content.ReadFromJsonAsync<SessionDto>())!;
        Assert.NotEqual(login.RefreshToken, refreshed.RefreshToken);
        Assert.Equal("alice", refreshed.Account.Username);

        var me = await client.GetWithTokenAsync("/api/identity/me", refreshed.AccessToken);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
    }

    [Fact]
    public async Task Post_refresh_with_an_already_used_token_revokes_the_whole_session()
    {
        await Factory.CreateAccountAsync("alice");
        var client = CreateAnonymousClient();
        var login = await client.LoginAsync("alice");
        var refreshed = (await (await client.PostRefreshAsync(login.RefreshToken)).Content.ReadFromJsonAsync<SessionDto>())!;

        var replay = await client.PostRefreshAsync(login.RefreshToken);

        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        Assert.Equal("invalid_refresh_token", await replay.ReadErrorCodeAsync());

        // The token issued by the legitimate rotation dies too: the server cannot tell who holds the stolen copy.
        var afterReplay = await client.PostRefreshAsync(refreshed.RefreshToken);
        Assert.Equal(HttpStatusCode.Unauthorized, afterReplay.StatusCode);
    }

    [Fact]
    public async Task Post_refresh_replay_does_not_end_sessions_on_other_devices()
    {
        await Factory.CreateAccountAsync("alice");
        var client = CreateAnonymousClient();
        var phone = await client.LoginAsync("alice");
        var laptop = await client.LoginAsync("alice");
        await client.PostRefreshAsync(phone.RefreshToken);
        await client.PostRefreshAsync(phone.RefreshToken);

        var response = await client.PostRefreshAsync(laptop.RefreshToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Post_refresh_with_unknown_token_returns_401()
    {
        var response = await CreateAnonymousClient().PostRefreshAsync("not-a-real-token");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("invalid_refresh_token", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Post_refresh_without_any_token_returns_401()
    {
        var response = await CreateAnonymousClient().PostAsync("/api/identity/refresh", content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("invalid_refresh_token", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Post_refresh_with_expired_token_returns_401()
    {
        await Factory.CreateAccountAsync("alice");
        var client = CreateAnonymousClient();
        var login = await client.LoginAsync("alice");

        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
            await dbContext.RefreshTokens.ExecuteUpdateAsync(s =>
                s.SetProperty(t => t.ExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        }

        var response = await client.PostRefreshAsync(login.RefreshToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("invalid_refresh_token", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Post_refresh_after_the_account_is_locked_returns_403_and_ends_the_session()
    {
        var account = await Factory.CreateAccountAsync("alice");
        var client = CreateAnonymousClient();
        var login = await client.LoginAsync("alice");
        await Factory.SetAccountStatusAsync(account.Id, AccountStatus.LOCKED);

        var response = await client.PostRefreshAsync(login.RefreshToken);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("account_locked", await response.ReadErrorCodeAsync());

        // Unlocking does not bring the old session back; the user signs in again.
        await Factory.SetAccountStatusAsync(account.Id, AccountStatus.ACTIVE);
        var afterUnlock = await client.PostRefreshAsync(login.RefreshToken);
        Assert.Equal(HttpStatusCode.Unauthorized, afterUnlock.StatusCode);
    }

    [Fact]
    public async Task Post_refresh_with_cookie_transport_rotates_the_cookie_and_keeps_the_token_out_of_the_body()
    {
        await Factory.CreateAccountAsync("alice");
        // The test client stores and resends cookies the way a browser does.
        var client = CreateAnonymousClient();
        var login = await client.PostLoginAsync("alice", useCookie: true);
        var loginCookie = Assert.Single(login.Headers.GetValues("Set-Cookie"));

        var response = await client.PostAsync("/api/identity/refresh", content: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var refreshed = (await response.Content.ReadFromJsonAsync<SessionDto>())!;
        Assert.Null(refreshed.RefreshToken);
        var refreshedCookie = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        Assert.NotEqual(loginCookie, refreshedCookie);
    }
}

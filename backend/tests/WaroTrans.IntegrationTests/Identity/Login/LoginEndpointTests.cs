using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Identity.Enums;
using WaroTrans.Identity.Persistence;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity.Login;

[Collection(IntegrationCollection.Name)]
public sealed class LoginEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Post_login_returns_token()
    {
        var account = await Factory.CreateAccountAsync("alice", AccountRole.STAFF);
        var client = CreateAnonymousClient();

        var response = await client.PostLoginAsync("alice");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var session = (await response.Content.ReadFromJsonAsync<SessionDto>())!;
        Assert.False(string.IsNullOrWhiteSpace(session.AccessToken));
        Assert.False(string.IsNullOrWhiteSpace(session.RefreshToken));
        Assert.True(session.AccessTokenExpiresAt > DateTimeOffset.UtcNow);
        Assert.Equal(account.Id, session.Account.Id);
        Assert.Equal("alice", session.Account.Username);
        Assert.Equal("STAFF", session.Account.Role);
        Assert.Equal("ACTIVE", session.Account.Status);
        Assert.NotNull(session.Account.LastLoginAt);
    }

    [Fact]
    public async Task Post_login_stores_only_a_hash_of_the_refresh_token()
    {
        await Factory.CreateAccountAsync("alice");
        var session = await CreateAnonymousClient().LoginAsync("alice");

        await using var scope = Factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var stored = await dbContext.RefreshTokens.SingleAsync();

        Assert.NotEqual(session.RefreshToken, stored.TokenHash);
        Assert.Equal(64, stored.TokenHash.Length);
        Assert.Null(stored.RevokedAt);
    }

    [Theory]
    [InlineData("alice", "wrong-password")]
    [InlineData("nobody", IdentityTestSupport.Password)]
    public async Task Post_login_with_bad_credentials_returns_401_without_revealing_which_part_was_wrong(
        string username,
        string password)
    {
        await Factory.CreateAccountAsync("alice");

        var response = await CreateAnonymousClient().PostLoginAsync(username, password);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("invalid_credentials", await response.ReadErrorCodeAsync());
    }

    [Theory]
    [InlineData(AccountStatus.LOCKED, "account_locked")]
    [InlineData(AccountStatus.INACTIVE, "account_inactive")]
    public async Task Post_login_for_non_active_account_returns_403(AccountStatus status, string expectedCode)
    {
        await Factory.CreateAccountAsync("alice", status: status);

        var response = await CreateAnonymousClient().PostLoginAsync("alice");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(expectedCode, await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Post_login_with_wrong_password_on_locked_account_does_not_reveal_the_lock()
    {
        await Factory.CreateAccountAsync("alice", status: AccountStatus.LOCKED);

        var response = await CreateAnonymousClient().PostLoginAsync("alice", "wrong-password");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("invalid_credentials", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Post_login_with_empty_username_returns_400()
    {
        var response = await CreateAnonymousClient().PostLoginAsync("", "whatever");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Post_login_with_cookie_transport_sets_http_only_cookie_and_omits_token_from_body()
    {
        await Factory.CreateAccountAsync("alice");

        var response = await CreateAnonymousClient().PostLoginAsync("alice", useCookie: true);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var session = (await response.Content.ReadFromJsonAsync<SessionDto>())!;
        Assert.Null(session.RefreshToken);

        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        Assert.StartsWith("warotrans_refresh=", cookie);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/api/identity", cookie, StringComparison.OrdinalIgnoreCase);
    }
}

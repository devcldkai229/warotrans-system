using System.Net;
using System.Net.Http.Json;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity.Authorization;

/// <summary>
/// Goes through the production JWT bearer scheme: tokens come from the real login endpoint.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class RoleAuthorizationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Theory]
    [InlineData("/api/identity/me")]
    [InlineData("/api/identity/accounts")]
    public async Task Protected_endpoint_without_token_returns_401(string url)
    {
        var response = await CreateAnonymousClient().GetAsync(url);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Protected_endpoint_with_a_token_that_was_not_issued_by_this_server_returns_401()
    {
        var response = await CreateAnonymousClient().GetWithTokenAsync("/api/identity/me", "not.a.jwt");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(AccountRole.ADMIN)]
    [InlineData(AccountRole.STAFF)]
    public async Task Get_me_returns_the_account_behind_the_token(AccountRole role)
    {
        var account = await Factory.CreateAccountAsync("alice", role);
        var client = CreateAnonymousClient();
        var session = await client.LoginAsync("alice");

        var response = await client.GetWithTokenAsync("/api/identity/me", session.AccessToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = (await response.Content.ReadFromJsonAsync<AccountDto>())!;
        Assert.Equal(account.Id, me.Id);
        Assert.Equal("alice", me.Username);
        Assert.Equal(role.ToString(), me.Role);
    }

    [Fact]
    public async Task Get_accounts_as_staff_returns_403()
    {
        await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var session = await client.LoginAsync("sam");

        var response = await client.GetWithTokenAsync("/api/identity/accounts", session.AccessToken);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Get_accounts_as_admin_returns_all_accounts_without_password_hashes()
    {
        await Factory.CreateAccountAsync("zoe", AccountRole.STAFF);
        await Factory.CreateAccountAsync("adam", AccountRole.ADMIN);
        var client = CreateAnonymousClient();
        var session = await client.LoginAsync("adam");

        var response = await client.GetWithTokenAsync("/api/identity/accounts", session.AccessToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("password", body, StringComparison.OrdinalIgnoreCase);

        var accounts = (await response.Content.ReadFromJsonAsync<ListAccountsDto>())!;
        Assert.Equal(["adam", "zoe"], accounts.Items.Select(a => a.Username));
    }

    [Fact]
    public async Task Public_endpoints_stay_reachable_without_a_token()
    {
        var client = CreateAnonymousClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/identity/ping")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/warehouse/ping")).StatusCode);
    }
}

using System.Net;
using System.Net.Http.Json;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity.AccountManagement;

/// <summary>
/// Admin account management: create, edit and activate/deactivate. Tokens come from the real login endpoint,
/// so the production JWT validation and the AdminOnly policy are exercised.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class AccountManagementEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private const string Accounts = "/api/identity/accounts";

    private static object NewStaff(string username = "newbie", string email = "newbie@warotrans.test") =>
        new { username, email, fullName = "New Person", role = "STAFF" };

    private async Task<(HttpClient Client, SessionDto Admin)> SignInAdminAsync(string username = "boss")
    {
        await Factory.CreateAccountAsync(username, AccountRole.ADMIN);
        var client = CreateAnonymousClient();
        return (client, await client.LoginAsync(username));
    }

    /* ------------------------------------------------------------------------------------------ create */

    [Fact]
    public async Task Create_returns_201_with_a_one_time_password_that_signs_the_new_account_in()
    {
        var (client, admin) = await SignInAdminAsync();

        var response = await client.SendWithTokenAsync(HttpMethod.Post, Accounts, admin.AccessToken, NewStaff());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Contains("no-store", response.Headers.CacheControl?.ToString());
        var created = (await response.Content.ReadFromJsonAsync<CreateAccountResultDto>())!;
        Assert.Equal("newbie", created.Account.Username);
        Assert.Equal("STAFF", created.Account.Role);
        Assert.Equal("ACTIVE", created.Account.Status);
        Assert.False(string.IsNullOrWhiteSpace(created.TemporaryPassword));

        var signIn = await client.PostLoginAsync("newbie", created.TemporaryPassword);
        Assert.Equal(HttpStatusCode.OK, signIn.StatusCode);

        // The password is not retrievable afterwards.
        var list = await client.GetWithTokenAsync(Accounts, admin.AccessToken);
        Assert.DoesNotContain(created.TemporaryPassword, await list.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Create_as_staff_returns_403()
    {
        await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var session = await client.LoginAsync("sam");

        var response = await client.SendWithTokenAsync(HttpMethod.Post, Accounts, session.AccessToken, NewStaff());

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Create_without_a_token_returns_401()
    {
        var response = await CreateAnonymousClient().PostAsJsonAsync(Accounts, NewStaff());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Create_with_a_taken_username_returns_409()
    {
        var (client, admin) = await SignInAdminAsync();
        await Factory.CreateAccountAsync("taken", AccountRole.STAFF);

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, Accounts, admin.AccessToken, NewStaff("taken", "someone.else@warotrans.test"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("username_taken", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Create_with_a_taken_email_in_any_letter_case_returns_409()
    {
        var (client, admin) = await SignInAdminAsync();
        await Factory.CreateAccountAsync("taken", AccountRole.STAFF); // email: taken@warotrans.test

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, Accounts, admin.AccessToken, NewStaff("another", "TAKEN@Warotrans.Test"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("email_taken", await response.ReadErrorCodeAsync());
    }

    [Theory]
    [InlineData("Alice", "alice@warotrans.test", "STAFF")] // sign-in compares usernames exactly, so upper case is refused
    [InlineData("al", "alice@warotrans.test", "STAFF")]
    [InlineData("has space", "alice@warotrans.test", "STAFF")]
    [InlineData("alice", "not-an-email", "STAFF")]
    [InlineData("alice", "alice@warotrans.test", "OWNER")]
    [InlineData("alice", "alice@warotrans.test", "staff")]
    public async Task Create_with_invalid_input_returns_400(string username, string email, string role)
    {
        var (client, admin) = await SignInAdminAsync();

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, Accounts, admin.AccessToken, new { username, email, fullName = "Alice", role });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", await response.ReadErrorCodeAsync());
    }

    /* -------------------------------------------------------------------------------------------- edit */

    [Fact]
    public async Task Edit_changes_name_and_email_without_touching_sessions()
    {
        var (client, admin) = await SignInAdminAsync();
        var staff = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var staffSession = await client.LoginAsync("sam");

        var response = await client.SendWithTokenAsync(
            HttpMethod.Put, $"{Accounts}/{staff.Id}", admin.AccessToken,
            new { email = "Sam.New@Warotrans.test", fullName = "  Sam Renamed ", role = "STAFF" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<AccountDto>())!;
        Assert.Equal("sam", updated.Username);
        Assert.Equal("sam.new@warotrans.test", updated.Email);
        Assert.Equal("Sam Renamed", updated.FullName);

        var refresh = await client.PostRefreshAsync(staffSession.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
    }

    [Fact]
    public async Task Edit_that_changes_the_role_ends_the_sessions_of_that_account()
    {
        var (client, admin) = await SignInAdminAsync();
        var staff = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var staffSession = await client.LoginAsync("sam");

        var response = await client.SendWithTokenAsync(
            HttpMethod.Put, $"{Accounts}/{staff.Id}", admin.AccessToken,
            new { email = staff.Email, fullName = staff.FullName, role = "ADMIN" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ADMIN", (await response.Content.ReadFromJsonAsync<AccountDto>())!.Role);

        var refresh = await client.PostRefreshAsync(staffSession.RefreshToken);
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    [Fact]
    public async Task Edit_cannot_change_the_role_of_the_signed_in_admin()
    {
        await Factory.CreateAccountAsync("backup", AccountRole.ADMIN);
        var (client, admin) = await SignInAdminAsync();

        var response = await client.SendWithTokenAsync(
            HttpMethod.Put, $"{Accounts}/{admin.Account.Id}", admin.AccessToken,
            new { email = admin.Account.Email, fullName = admin.Account.FullName, role = "STAFF" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("cannot_change_own_access", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Edit_may_rename_the_signed_in_admin_when_the_role_stays()
    {
        var (client, admin) = await SignInAdminAsync();

        var response = await client.SendWithTokenAsync(
            HttpMethod.Put, $"{Accounts}/{admin.Account.Id}", admin.AccessToken,
            new { email = admin.Account.Email, fullName = "Boss Renamed", role = "ADMIN" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Edit_with_an_email_used_by_another_account_returns_409()
    {
        var (client, admin) = await SignInAdminAsync();
        var sam = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var zoe = await Factory.CreateAccountAsync("zoe", AccountRole.STAFF);

        var response = await client.SendWithTokenAsync(
            HttpMethod.Put, $"{Accounts}/{sam.Id}", admin.AccessToken,
            new { email = zoe.Email, fullName = sam.FullName, role = "STAFF" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("email_taken", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Edit_cannot_demote_the_last_active_admin()
    {
        var (client, caller) = await SignInAdminAsync("caller");
        var target = await Factory.CreateAccountAsync("onlyadmin", AccountRole.ADMIN);
        // The caller's token still says ADMIN, but in the database they are no longer an administrator.
        await Factory.SetAccountRoleAsync(caller.Account.Id, AccountRole.STAFF);

        var response = await client.SendWithTokenAsync(
            HttpMethod.Put, $"{Accounts}/{target.Id}", caller.AccessToken,
            new { email = target.Email, fullName = target.FullName, role = "STAFF" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("last_active_admin", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Edit_unknown_account_returns_404()
    {
        var (client, admin) = await SignInAdminAsync();

        var response = await client.SendWithTokenAsync(
            HttpMethod.Put, $"{Accounts}/{Guid.NewGuid()}", admin.AccessToken,
            new { email = "x@warotrans.test", fullName = "X", role = "STAFF" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("target_account_not_found", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Edit_cannot_change_the_username()
    {
        var (client, admin) = await SignInAdminAsync();
        var sam = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);

        var response = await client.SendWithTokenAsync(
            HttpMethod.Put, $"{Accounts}/{sam.Id}", admin.AccessToken,
            new { username = "renamed", email = sam.Email, fullName = sam.FullName, role = "STAFF" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("sam", (await response.Content.ReadFromJsonAsync<AccountDto>())!.Username);
    }

    /* ------------------------------------------------------------------------------------------ status */

    [Fact]
    public async Task Deactivate_blocks_sign_in_and_ends_open_sessions_and_activate_restores_it()
    {
        var (client, admin) = await SignInAdminAsync();
        var sam = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var samSession = await client.LoginAsync("sam");

        var deactivate = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Accounts}/{sam.Id}/status", admin.AccessToken, new { status = "INACTIVE" });

        Assert.Equal(HttpStatusCode.OK, deactivate.StatusCode);
        Assert.Equal("INACTIVE", (await deactivate.Content.ReadFromJsonAsync<AccountDto>())!.Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostLoginAsync("sam")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostRefreshAsync(samSession.RefreshToken)).StatusCode);

        var activate = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Accounts}/{sam.Id}/status", admin.AccessToken, new { status = "ACTIVE" });

        Assert.Equal(HttpStatusCode.OK, activate.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostLoginAsync("sam")).StatusCode);
    }

    [Fact]
    public async Task Activate_unlocks_a_locked_account()
    {
        var (client, admin) = await SignInAdminAsync();
        var sam = await Factory.CreateAccountAsync("sam", AccountRole.STAFF, AccountStatus.LOCKED);

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Accounts}/{sam.Id}/status", admin.AccessToken, new { status = "ACTIVE" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ACTIVE", (await response.Content.ReadFromJsonAsync<AccountDto>())!.Status);
    }

    [Fact]
    public async Task Setting_the_current_status_again_is_accepted()
    {
        var (client, admin) = await SignInAdminAsync();
        var sam = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Accounts}/{sam.Id}/status", admin.AccessToken, new { status = "ACTIVE" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Deactivate_cannot_target_the_signed_in_admin()
    {
        await Factory.CreateAccountAsync("backup", AccountRole.ADMIN);
        var (client, admin) = await SignInAdminAsync();

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Accounts}/{admin.Account.Id}/status", admin.AccessToken, new { status = "INACTIVE" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("cannot_change_own_access", await response.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Deactivate_cannot_remove_the_last_active_admin()
    {
        var (client, caller) = await SignInAdminAsync("caller");
        var target = await Factory.CreateAccountAsync("onlyadmin", AccountRole.ADMIN);
        await Factory.SetAccountRoleAsync(caller.Account.Id, AccountRole.STAFF);

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Accounts}/{target.Id}/status", caller.AccessToken, new { status = "INACTIVE" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("last_active_admin", await response.ReadErrorCodeAsync());
    }

    [Theory]
    [InlineData("LOCKED")]
    [InlineData("DELETED")]
    [InlineData("active")]
    [InlineData("")]
    public async Task Status_other_than_active_or_inactive_returns_400(string status)
    {
        var (client, admin) = await SignInAdminAsync();
        var sam = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Accounts}/{sam.Id}/status", admin.AccessToken, new { status });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Status_of_unknown_account_returns_404()
    {
        var (client, admin) = await SignInAdminAsync();

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Accounts}/{Guid.NewGuid()}/status", admin.AccessToken, new { status = "INACTIVE" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Status_as_staff_returns_403()
    {
        var sam = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var session = await client.LoginAsync("sam");

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, $"{Accounts}/{sam.Id}/status", session.AccessToken, new { status = "INACTIVE" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}

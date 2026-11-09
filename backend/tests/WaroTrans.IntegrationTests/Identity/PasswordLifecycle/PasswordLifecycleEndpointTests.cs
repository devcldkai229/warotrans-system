using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity.PasswordLifecycle;

/// <summary>IDN-01 (change own password, forced at first sign-in), IDN-02 (Admin reset) and IDN-03 (GET by id).</summary>
[Collection(IntegrationCollection.Name)]
public sealed class PasswordLifecycleEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private const string NewPassword = "Brand-New-Pass-42";

    private async Task<(HttpClient Client, SessionDto Admin)> SignInAdminAsync()
    {
        await Factory.CreateAccountAsync("boss", AccountRole.ADMIN);
        var client = CreateAnonymousClient();
        return (client, await client.LoginAsync("boss"));
    }

    private static async Task<CreateAccountResultDto> CreateStaffViaApiAsync(HttpClient client, SessionDto admin)
    {
        var response = await client.SendWithTokenAsync(
            HttpMethod.Post,
            "/api/identity/accounts",
            admin.AccessToken,
            new { username = "newbie", email = "newbie@warotrans.test", fullName = "New Person", role = "STAFF" });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CreateAccountResultDto>())!;
    }

    private static async Task<SessionDto> LoginWithAsync(HttpClient client, string username, string password)
    {
        var response = await client.PostLoginAsync(username, password);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SessionDto>())!;
    }

    [Fact]
    public async Task A_temporary_password_only_opens_me_and_change_password()
    {
        var (client, admin) = await SignInAdminAsync();
        var created = await CreateStaffViaApiAsync(client, admin);
        var session = await LoginWithAsync(client, "newbie", created.TemporaryPassword);

        var me = await client.GetWithTokenAsync("/api/identity/me", session.AccessToken);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.True((await me.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("mustChangePassword").GetBoolean());

        var capabilities = await client.GetWithTokenAsync("/api/identity/me/capabilities", session.AccessToken);
        var body = await capabilities.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("mustChangePassword").GetBoolean());
        Assert.Equal(0, body.GetProperty("permissions").GetArrayLength());

        var blocked = await client.GetWithTokenAsync("/api/transportation/transport-requests", session.AccessToken);
        Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);
        Assert.Equal("password_change_required", await blocked.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Changing_the_password_clears_the_mark_and_the_new_password_signs_in()
    {
        var (client, admin) = await SignInAdminAsync();
        var created = await CreateStaffViaApiAsync(client, admin);
        var session = await LoginWithAsync(client, "newbie", created.TemporaryPassword);

        var change = await client.SendWithTokenAsync(
            HttpMethod.Post,
            "/api/identity/me/change-password",
            session.AccessToken,
            new { currentPassword = created.TemporaryPassword, newPassword = NewPassword });

        Assert.Equal(HttpStatusCode.OK, change.StatusCode);
        var fresh = (await change.Content.ReadFromJsonAsync<SessionDto>())!;
        var nowAllowed = await client.GetWithTokenAsync("/api/transportation/transport-requests", fresh.AccessToken);
        Assert.Equal(HttpStatusCode.OK, nowAllowed.StatusCode);

        // The old password no longer works, the old device session is gone, the new password works.
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostLoginAsync("newbie", created.TemporaryPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostRefreshAsync(session.RefreshToken)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostLoginAsync("newbie", NewPassword)).StatusCode);
    }

    [Fact]
    public async Task A_wrong_current_password_is_rejected()
    {
        await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var session = await client.LoginAsync("sam");

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post,
            "/api/identity/me/change-password",
            session.AccessToken,
            new { currentPassword = "not-my-password-1", newPassword = NewPassword });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("current_password_incorrect", await response.ReadErrorCodeAsync());
        Assert.Equal(HttpStatusCode.OK, (await client.PostLoginAsync("sam")).StatusCode);
    }

    [Theory]
    [InlineData("short1")] // too short
    [InlineData("onlyletterslong")] // no digit
    [InlineData("1234567890123")] // no letter
    public async Task A_weak_new_password_is_rejected(string weak)
    {
        await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var client = CreateAnonymousClient();
        var session = await client.LoginAsync("sam");

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post,
            "/api/identity/me/change-password",
            session.AccessToken,
            new { currentPassword = IdentityTestSupport.Password, newPassword = weak });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Admin_reset_issues_a_temporary_password_and_ends_the_users_sessions()
    {
        var (client, admin) = await SignInAdminAsync();
        var staff = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var staffSession = await client.LoginAsync("sam");

        var response = await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/identity/accounts/{staff.Id}/reset-password", admin.AccessToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("no-store", response.Headers.CacheControl?.ToString());
        var reset = (await response.Content.ReadFromJsonAsync<CreateAccountResultDto>())!;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostRefreshAsync(staffSession.RefreshToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostLoginAsync("sam")).StatusCode);

        var withTemporary = await LoginWithAsync(client, "sam", reset.TemporaryPassword);
        var blocked = await client.GetWithTokenAsync("/api/warehouse/containers", withTemporary.AccessToken);
        Assert.Equal("password_change_required", await blocked.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task Reset_is_forbidden_for_staff_and_for_the_admins_own_account()
    {
        var (client, admin) = await SignInAdminAsync();
        var staff = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var staffSession = await client.LoginAsync("sam");

        var asStaff = await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/identity/accounts/{staff.Id}/reset-password", staffSession.AccessToken);
        Assert.Equal(HttpStatusCode.Forbidden, asStaff.StatusCode);

        var own = await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/identity/accounts/{admin.Account.Id}/reset-password", admin.AccessToken);
        Assert.Equal(HttpStatusCode.Forbidden, own.StatusCode);
        Assert.Equal("cannot_reset_own_password", await own.ReadErrorCodeAsync());
    }

    [Fact]
    public async Task The_location_returned_by_create_resolves_to_the_account()
    {
        var (client, admin) = await SignInAdminAsync();
        var response = await client.SendWithTokenAsync(
            HttpMethod.Post,
            "/api/identity/accounts",
            admin.AccessToken,
            new { username = "newbie", email = "newbie@warotrans.test", fullName = "New Person", role = "TECHNICIAN" });
        var location = response.Headers.Location!.ToString();

        var get = await client.GetWithTokenAsync(location, admin.AccessToken);

        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        var body = await get.Content.ReadAsStringAsync();
        Assert.Contains("\"username\":\"newbie\"", body);
        Assert.Contains("\"role\":\"TECHNICIAN\"", body);
        Assert.DoesNotContain("password\"", body.Replace("mustChangePassword\"", string.Empty), StringComparison.OrdinalIgnoreCase);

        var missing = await client.GetWithTokenAsync($"/api/identity/accounts/{Guid.NewGuid()}", admin.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }
}

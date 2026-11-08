using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity.Authorization;

/// <summary>
/// IDN-04 / RB-01 / POL-01: the permission matrix and the Technician robot scope, through the production JWT
/// scheme (tokens from the real login endpoint), so a hand-made HTTP call cannot get around them.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class PermissionAuthorizationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    private async Task<(HttpClient Client, SessionDto Session)> SignInAsync(string username, AccountRole role)
    {
        await Factory.CreateAccountAsync(username, role);
        var client = CreateAnonymousClient();
        return (client, await client.LoginAsync(username));
    }

    private async Task<Guid> SeedRobotAsync(string code)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), code, "Robot " + code, DateTimeOffset.UtcNow);
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot.Id;
    }

    [Theory]
    [InlineData(AccountRole.STAFF)]
    [InlineData(AccountRole.TECHNICIAN)]
    public async Task Only_admin_may_change_maps(AccountRole role)
    {
        var (client, session) = await SignInAsync("someone", role);

        var create = await client.SendWithTokenAsync(
            HttpMethod.Post,
            $"/api/navigation/warehouses/{Guid.NewGuid()}/maps",
            session.AccessToken,
            new { name = "Map", mapUri = "/map-assets/map.pgm", resolution = 0.05, originX = 0, originY = 0, originYaw = 0 });
        var publish = await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/navigation/maps/{Guid.NewGuid()}/publish", session.AccessToken);
        var deleteZone = await client.SendWithTokenAsync(
            HttpMethod.Delete, $"/api/navigation/zones/{Guid.NewGuid()}", session.AccessToken);

        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, publish.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, deleteZone.StatusCode);
    }

    [Theory]
    [InlineData(AccountRole.STAFF)]
    [InlineData(AccountRole.TECHNICIAN)]
    public async Task Staff_and_technician_still_read_maps(AccountRole role)
    {
        var (client, session) = await SignInAsync("reader", role);

        var response = await client.GetWithTokenAsync(
            $"/api/navigation/warehouses/{Guid.NewGuid()}/maps", session.AccessToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Staff_cannot_drive_a_robot_but_can_stop_it()
    {
        var robotId = await SeedRobotAsync("RBT-PERM-1");
        var (client, session) = await SignInAsync("sam", AccountRole.STAFF);

        var teleop = await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/fleet/robots/{robotId}/teleop", session.AccessToken, new { linear = 0.1, angular = 0.0 });
        var navigate = await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/fleet/robots/{robotId}/commands/navigate", session.AccessToken, new { x = 1.0, y = 1.0, yaw = 0.0 });
        var cancel = await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/fleet/robots/{robotId}/commands/cancel", session.AccessToken, new { });

        Assert.Equal(HttpStatusCode.Forbidden, teleop.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, navigate.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, cancel.StatusCode);
    }

    [Fact]
    public async Task Technician_cannot_raise_transport_requests_or_manage_accounts()
    {
        var (client, session) = await SignInAsync("tech", AccountRole.TECHNICIAN);

        var createRequest = await client.SendWithTokenAsync(
            HttpMethod.Post, "/api/transportation/transport-requests", session.AccessToken, new { });
        var accounts = await client.GetWithTokenAsync("/api/identity/accounts", session.AccessToken);
        var product = await client.SendWithTokenAsync(
            HttpMethod.Post, "/api/warehouse/products", session.AccessToken, new { });

        Assert.Equal(HttpStatusCode.Forbidden, createRequest.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, accounts.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, product.StatusCode);
    }

    [Fact]
    public async Task Technician_only_sees_and_acts_on_assigned_robots()
    {
        var mine = await SeedRobotAsync("RBT-MINE");
        var other = await SeedRobotAsync("RBT-OTHER");
        var tech = await Factory.CreateAccountAsync("tech", AccountRole.TECHNICIAN);
        await Factory.CreateAccountAsync("boss", AccountRole.ADMIN);
        var client = CreateAnonymousClient();
        var admin = await client.LoginAsync("boss");

        var assign = await client.SendWithTokenAsync(
            HttpMethod.Put, $"/api/identity/accounts/{tech.Id}/robot-scope", admin.AccessToken, new { robotIds = new[] { mine } });
        Assert.Equal(HttpStatusCode.OK, assign.StatusCode);

        var session = await client.LoginAsync("tech");

        var list = await client.GetWithTokenAsync("/api/fleet/robots", session.AccessToken);
        var codes = (await list.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items")
            .EnumerateArray().Select(r => r.GetProperty("code").GetString()).ToList();
        Assert.Equal(["RBT-MINE"], codes);

        Assert.Equal(HttpStatusCode.OK, (await client.GetWithTokenAsync($"/api/fleet/robots/{mine}", session.AccessToken)).StatusCode);

        var foreign = await client.GetWithTokenAsync($"/api/fleet/robots/{other}", session.AccessToken);
        Assert.Equal(HttpStatusCode.Forbidden, foreign.StatusCode);
        Assert.Equal("robot_out_of_scope", await foreign.ReadErrorCodeAsync());

        var foreignStop = await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/fleet/robots/{other}/commands/cancel", session.AccessToken, new { });
        Assert.Equal("robot_out_of_scope", await foreignStop.ReadErrorCodeAsync());

        var capabilities = await client.GetWithTokenAsync("/api/identity/me/capabilities", session.AccessToken);
        var scope = (await capabilities.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("robotScope");
        Assert.False(scope.GetProperty("allRobots").GetBoolean());
        Assert.Equal(mine, scope.GetProperty("robotIds")[0].GetGuid());
    }

    [Fact]
    public async Task A_technician_without_assignments_sees_no_robot()
    {
        await SeedRobotAsync("RBT-ANY");
        var (client, session) = await SignInAsync("tech", AccountRole.TECHNICIAN);

        var list = await client.GetWithTokenAsync("/api/fleet/robots", session.AccessToken);

        Assert.Equal(0, (await list.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task Robot_scope_is_only_for_technicians()
    {
        var staff = await Factory.CreateAccountAsync("sam", AccountRole.STAFF);
        var (client, admin) = await SignInAsync("boss", AccountRole.ADMIN);

        var response = await client.SendWithTokenAsync(
            HttpMethod.Put, $"/api/identity/accounts/{staff.Id}/robot-scope", admin.AccessToken, new { robotIds = new[] { Guid.NewGuid() } });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("robot_scope_requires_technician", await response.ReadErrorCodeAsync());
    }

    [Theory]
    [InlineData(AccountRole.ADMIN, true)]
    [InlineData(AccountRole.STAFF, false)]
    [InlineData(AccountRole.TECHNICIAN, false)]
    public async Task Capabilities_list_what_the_server_enforces(AccountRole role, bool allRobotsAndUsers)
    {
        var (client, session) = await SignInAsync("someone", role);

        var response = await client.GetWithTokenAsync("/api/identity/me/capabilities", session.AccessToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(role.ToString(), body.GetProperty("role").GetString());
        var permissions = body.GetProperty("permissions").EnumerateArray().Select(p => p.GetString()).ToList();
        Assert.Equal(allRobotsAndUsers, permissions.Contains("user.manage"));
        Assert.Equal(role != AccountRole.TECHNICIAN, body.GetProperty("robotScope").GetProperty("allRobots").GetBoolean());
    }

    [Theory]
    [InlineData(false, HttpStatusCode.Unauthorized)]
    [InlineData(true, HttpStatusCode.NotFound)]
    public async Task Map_assets_need_a_signed_in_user(bool withToken, HttpStatusCode expected)
    {
        var (client, session) = await SignInAsync("reader", AccountRole.STAFF);
        var url = $"/map-assets/{Guid.NewGuid()}/{Guid.NewGuid()}/map.pgm";
        if (withToken)
        {
            url += $"?access_token={session.AccessToken}";
        }

        var response = await client.GetAsync(url);

        Assert.Equal(expected, response.StatusCode);
    }

    /// <summary>
    /// POL-01 safety net: no endpoint may rely on the fallback policy alone. Each one states who may call it
    /// (a permission, an explicit RequireAuthorization, or AllowAnonymous), and every write states a permission.
    /// </summary>
    [Fact]
    public void Every_endpoint_declares_its_authorization_and_every_write_a_permission()
    {
        // Writes a signed-in user may always do on their own account.
        string[] ownAccountWrites = ["/api/identity/me/change-password"];

        var endpoints = Factory.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>();
        var missing = new List<string>();
        var writesWithoutPermission = new List<string>();

        foreach (var endpoint in endpoints)
        {
            var methods = endpoint.Metadata.GetMetadata<Microsoft.AspNetCore.Routing.HttpMethodMetadata>()?.HttpMethods ?? [];
            var route = "/" + endpoint.RoutePattern.RawText?.TrimStart('/');
            var name = $"{string.Join(',', methods)} {route}";
            var anonymous = endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null;
            var authorizeData = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>();

            if (!anonymous && authorizeData.Count == 0)
            {
                missing.Add(name);
            }

            var isWrite = methods.Any(m => m is "POST" or "PUT" or "DELETE" or "PATCH");
            if (isWrite && !anonymous && !route.StartsWith("/hubs/", StringComparison.Ordinal)
                && !ownAccountWrites.Contains(route)
                && !authorizeData.Any(a => a.Policy?.StartsWith("perm:", StringComparison.Ordinal) == true))
            {
                writesWithoutPermission.Add(name);
            }
        }

        Assert.True(missing.Count == 0, "Endpoints without explicit authorization: " + string.Join("; ", missing));
        Assert.True(writesWithoutPermission.Count == 0, "Writes without a permission: " + string.Join("; ", writesWithoutPermission));
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity.Authorization;

/// <summary>WEB-MGMT-01: GET /api/identity/roles shows the role-permission matrix, read from RolePermissionMatrix.</summary>
[Collection(IntegrationCollection.Name)]
public sealed class RolesEndpointTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Route = "/api/identity/roles";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record RoleDto(string Role, List<string> Permissions, bool RobotScoped);

    private sealed record RolesDto(List<RoleDto> Roles, List<string> AllPermissions);

    [Fact]
    public async Task An_admin_gets_every_role_with_exactly_the_permissions_the_server_enforces()
    {
        var roles = (await Client.GetFromJsonAsync<RolesDto>(Route, JsonOptions))!;

        Assert.Equal(["ADMIN", "STAFF", "TECHNICIAN"], roles.Roles.Select(r => r.Role));
        foreach (var role in roles.Roles)
        {
            Assert.Equal(RolePermissionMatrix.PermissionsOf(role.Role), role.Permissions);
        }

        Assert.Equal(Permissions.All.Order(StringComparer.Ordinal), roles.AllPermissions);
        Assert.Equal(roles.AllPermissions, roles.Roles.Single(r => r.Role == "ADMIN").Permissions);
    }

    [Fact]
    public async Task Only_a_technician_is_limited_to_assigned_robots_and_neither_staff_nor_technician_manage_accounts()
    {
        var roles = (await Client.GetFromJsonAsync<RolesDto>(Route, JsonOptions))!;
        var byRole = roles.Roles.ToDictionary(r => r.Role);

        Assert.True(byRole["TECHNICIAN"].RobotScoped);
        Assert.False(byRole["ADMIN"].RobotScoped);
        Assert.False(byRole["STAFF"].RobotScoped);
        Assert.DoesNotContain(Permissions.UserManage, byRole["STAFF"].Permissions);
        Assert.DoesNotContain(Permissions.UserManage, byRole["TECHNICIAN"].Permissions);
        // Staff work in the mobile app, a Technician in the console.
        Assert.DoesNotContain(Permissions.ConsoleAccess, byRole["STAFF"].Permissions);
        Assert.Contains(Permissions.ConsoleAccess, byRole["TECHNICIAN"].Permissions);
    }

    [Theory]
    [InlineData(AccountRole.STAFF)]
    [InlineData(AccountRole.TECHNICIAN)]
    public async Task Only_an_admin_may_read_the_matrix(AccountRole role)
    {
        await Factory.CreateAccountAsync("roles-reader", role);
        var client = CreateAnonymousClient();
        var session = await client.LoginAsync("roles-reader");

        var response = await client.SendWithTokenAsync(HttpMethod.Get, Route, session.AccessToken);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Anonymous_callers_are_turned_away()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await CreateAnonymousClient().GetAsync(Route)).StatusCode);
    }
}

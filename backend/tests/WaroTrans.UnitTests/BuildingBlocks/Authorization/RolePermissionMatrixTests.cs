using System.Security.Claims;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.UnitTests.BuildingBlocks.Authorization;

public class RolePermissionMatrixTests
{
    [Fact]
    public void Permission_names_are_unique_and_follow_resource_dot_action()
    {
        Assert.Equal(Permissions.All.Count, Permissions.All.Distinct(StringComparer.Ordinal).Count());
        Assert.All(Permissions.All, p => Assert.Matches(@"^[a-z]+(\.[a-z]+)+$", p));
    }

    [Fact]
    public void Admin_holds_every_permission()
    {
        Assert.All(Permissions.All, p => Assert.True(RolePermissionMatrix.RoleHas(AppRoles.Admin, p), p));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("admin")] // role names are case sensitive, as in the token
    [InlineData("SUPERUSER")]
    public void Unknown_role_holds_nothing(string? role)
    {
        Assert.Empty(RolePermissionMatrix.PermissionsOf(role));
        Assert.False(RolePermissionMatrix.RoleHas(role, Permissions.RobotRead));
    }

    [Theory]
    [InlineData(Permissions.RobotManualDrive)]
    [InlineData(Permissions.RobotCommand)]
    [InlineData(Permissions.RobotConfigure)]
    [InlineData(Permissions.UserManage)]
    [InlineData(Permissions.MapWrite)]
    [InlineData(Permissions.WarehouseWrite)]
    [InlineData(Permissions.ConsoleAccess)]
    [InlineData(Permissions.TrafficManage)]
    public void Staff_cannot_drive_reconfigure_or_administer(string permission)
    {
        Assert.False(RolePermissionMatrix.RoleHas(AppRoles.Staff, permission));
    }

    [Theory]
    [InlineData(Permissions.RobotStop)]
    [InlineData(Permissions.TransportCreate)]
    [InlineData(Permissions.JobOperate)]
    [InlineData(Permissions.ContainerCreate)]
    [InlineData(Permissions.MapRead)]
    public void Staff_keeps_the_floor_rights_the_mobile_app_uses(string permission)
    {
        Assert.True(RolePermissionMatrix.RoleHas(AppRoles.Staff, permission));
    }

    [Theory]
    [InlineData(Permissions.UserManage)]
    [InlineData(Permissions.WarehouseWrite)]
    [InlineData(Permissions.ContainerCreate)]
    [InlineData(Permissions.TransportCreate)]
    [InlineData(Permissions.TransportCancel)]
    [InlineData(Permissions.MapWrite)]
    [InlineData(Permissions.RobotManage)]
    [InlineData(Permissions.DispatchOverride)]
    public void Technician_cannot_grant_roles_change_stock_or_author_maps(string permission)
    {
        Assert.False(RolePermissionMatrix.RoleHas(AppRoles.Technician, permission));
    }

    [Theory]
    [InlineData(Permissions.RobotRead)]
    [InlineData(Permissions.RobotDiagnostics)]
    [InlineData(Permissions.RobotStop)]
    [InlineData(Permissions.RobotManualDrive)]
    [InlineData(Permissions.RobotMaintenance)]
    [InlineData(Permissions.ConsoleAccess)]
    public void Technician_reads_diagnoses_stops_and_drives_robots(string permission)
    {
        Assert.True(RolePermissionMatrix.RoleHas(AppRoles.Technician, permission));
    }

    [Fact]
    public void Every_role_only_holds_declared_permissions()
    {
        foreach (var role in AppRoles.All)
        {
            Assert.All(RolePermissionMatrix.PermissionsOf(role), p => Assert.Contains(p, Permissions.All));
        }
    }

    [Theory]
    [InlineData(ClaimTypes.Role)] // test authentication scheme
    [InlineData(AppClaimTypes.Role)] // production JWT ("role")
    public void UserHas_reads_the_role_whatever_claim_type_the_scheme_uses(string roleClaimType)
    {
        var identity = new ClaimsIdentity(
            [new Claim(roleClaimType, AppRoles.Technician)],
            authenticationType: "Test",
            nameType: ClaimTypes.Name,
            roleType: roleClaimType);
        var user = new ClaimsPrincipal(identity);

        Assert.True(RolePermissionMatrix.UserHas(user, Permissions.RobotStop));
        Assert.False(RolePermissionMatrix.UserHas(user, Permissions.UserManage));
    }

    [Fact]
    public void RequirePermission_rejects_a_misspelt_permission()
    {
        Assert.Throws<ArgumentException>(() =>
            new FakeConventionBuilder().RequirePermission("robot.drive"));
    }

    private sealed class FakeConventionBuilder : Microsoft.AspNetCore.Builder.IEndpointConventionBuilder
    {
        public void Add(Action<Microsoft.AspNetCore.Builder.EndpointBuilder> convention)
        {
        }
    }

    [Fact]
    public void RobotScope_allows_only_listed_robots_unless_it_covers_all()
    {
        var mine = Guid.NewGuid();
        var scope = new RobotScope(false, [mine]);

        Assert.True(scope.Allows(mine));
        Assert.False(scope.Allows(Guid.NewGuid()));
        Assert.True(RobotScope.Everything.Allows(Guid.NewGuid()));
        Assert.False(RobotScope.Nothing.Allows(mine));
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Identity.Enums;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Identity.Authorization;

/// <summary>
/// POL-02 / POL-03: every Fleet route and every Workflow write, refused for real over HTTP with tokens from the login
/// endpoint. A new Fleet route fails the test until it is listed here.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class SensitiveRouteAuthorizationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    /// <param name="Scoped">The route names a robot, so a Technician must have that robot in scope.</param>
    private sealed record FleetRoute(string Method, string Pattern, string Permission, bool Scoped);

    private static readonly FleetRoute[] FleetRoutes =
    [
        new("POST", "/api/fleet/robots", Permissions.RobotManage, false),
        new("GET", "/api/fleet/robots", Permissions.RobotRead, false),
        new("GET", "/api/fleet/robots/{id:guid}", Permissions.RobotRead, true),
        new("PUT", "/api/fleet/robots/{id:guid}/map", Permissions.RobotManage, false),
        new("POST", "/api/fleet/robots/{id:guid}/enable", Permissions.RobotConfigure, true),
        new("POST", "/api/fleet/robots/{id:guid}/disable", Permissions.RobotConfigure, true),
        new("POST", "/api/fleet/robots/{id:guid}/put-in-service", Permissions.RobotConfigure, true),
        new("POST", "/api/fleet/robots/{id:guid}/teleop", Permissions.RobotManualDrive, true),
        new("POST", "/api/fleet/robots/{id:guid}/commands/navigate", Permissions.RobotCommand, true),
        new("POST", "/api/fleet/robots/{id:guid}/commands/cancel", Permissions.RobotStop, true),
        new("POST", "/api/fleet/robots/{id:guid}/commands/stop", Permissions.RobotStop, true),
        new("POST", "/api/fleet/robots/{id:guid}/commands/resume", Permissions.RobotConfigure, true),
        new("POST", "/api/fleet/robots/{id:guid}/commands/localize", Permissions.RobotCommand, true),
        new("GET", "/api/fleet/robots/{id:guid}/stop-state", Permissions.RobotRead, true),
        new("GET", "/api/fleet/robots/{id:guid}/manual/lease", Permissions.RobotRead, true),
        new("POST", "/api/fleet/robots/{id:guid}/manual/lease", Permissions.RobotManualDrive, true),
        new("DELETE", "/api/fleet/robots/{id:guid}/manual/lease", Permissions.RobotManualDrive, true),
        new("GET", "/api/fleet/robots/{id:guid}/maintenance", Permissions.RobotRead, true),
        new("POST", "/api/fleet/robots/{id:guid}/maintenance/start", Permissions.RobotMaintenance, true),
        new("POST", "/api/fleet/robots/{id:guid}/maintenance/complete", Permissions.RobotMaintenance, true),
        new("POST", "/api/fleet/robots/{id:guid}/system-actions", Permissions.RobotPower, true),
        new("GET", "/api/fleet/robots/{id:guid}/health", Permissions.RobotDiagnostics, true),
        new("PUT", "/api/fleet/robots/{id:guid}/capacity", Permissions.RobotConfigure, true),
        new("GET", "/api/fleet/robots/{id:guid}/state-history", Permissions.RobotRead, true),
        new("GET", "/api/fleet/robots/{id:guid}/pose-history", Permissions.RobotRead, true),
        new("GET", "/api/fleet/robots/{id:guid}/commands/catalog", Permissions.RobotRead, true),
        new("GET", "/api/fleet/robots/{id:guid}/camera/stream", Permissions.RobotRead, true),
        new("GET", "/api/fleet/statistics/robots", Permissions.StatisticsRead, false),
        new("GET", "/api/fleet/statistics/availability", Permissions.StatisticsRead, false),
        new("GET", "/api/fleet/traffic/snapshot", Permissions.TrafficRead, false),
        new("GET", "/api/fleet/traffic/diagnostics", Permissions.TrafficRead, false),
        new("GET", "/api/fleet/traffic/ops-log", Permissions.TrafficRead, false),
        new("POST", "/api/fleet/traffic/robots/{robotId:guid}/reconcile", Permissions.TrafficManage, true),
        new("POST", "/api/fleet/traffic/robots/{robotId:guid}/release-after-clearance", Permissions.TrafficManage, true),
    ];

    private async Task<Guid> SeedRobotAsync(string code, bool online = false)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), code, "Robot " + code, DateTimeOffset.UtcNow);
        robot.IsOnline = online;
        // The connectivity monitor (1 s tick, 2 s timeout in tests) turns an online robot without a heartbeat OFFLINE mid-test.
        robot.LastHeartbeatAt = online ? DateTimeOffset.UtcNow.AddHours(1) : null;
        db.Robots.Add(robot);
        await db.SaveChangesAsync();
        return robot.Id;
    }

    private static string Url(FleetRoute route, Guid robotId) =>
        route.Pattern.Replace("{id:guid}", robotId.ToString()).Replace("{robotId:guid}", robotId.ToString());

    private static string Declared(RouteEndpoint endpoint) =>
        endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>()
            .Select(a => a.Policy)
            .FirstOrDefault(p => p?.StartsWith(PermissionPolicies.Prefix, StringComparison.Ordinal) == true)
            ?[PermissionPolicies.Prefix.Length..] ?? "(none)";

    [Fact]
    public void The_table_lists_every_Fleet_route_with_the_permission_it_declares()
    {
        var actual = Factory.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>()
            .Where(e => ("/" + e.RoutePattern.RawText?.TrimStart('/')).StartsWith("/api/fleet/", StringComparison.Ordinal))
            .Where(e => e.RoutePattern.RawText?.EndsWith("/ping", StringComparison.Ordinal) != true)
            .Where(e => e.Metadata.GetMetadata<HttpMethodMetadata>() is not null)
            .SelectMany(e => e.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods
                .Select(m => $"{m} /{e.RoutePattern.RawText?.TrimStart('/')} {Declared(e)}"))
            .ToList();

        var expected = FleetRoutes.Select(r => $"{r.Method} {r.Pattern} {r.Permission}").ToHashSet(StringComparer.Ordinal);
        var unlisted = actual.Where(a => !expected.Contains(a)).ToList();
        var stale = expected.Where(e => !actual.Contains(e)).ToList();

        Assert.True(unlisted.Count == 0, "Fleet routes missing from the table: " + string.Join("; ", unlisted));
        Assert.True(stale.Count == 0, "Table rows that do not match a route: " + string.Join("; ", stale));
    }

    [Theory]
    [InlineData(AccountRole.STAFF, "role_check_staff")]
    [InlineData(AccountRole.TECHNICIAN, "role_check_tech")]
    public async Task A_role_without_the_permission_is_refused_on_every_Fleet_route(AccountRole role, string username)
    {
        var robotId = await SeedRobotAsync("RBT-AUTHZ");
        await Factory.CreateAccountAsync(username, role);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync(username)).AccessToken;

        var wrong = new List<string>();
        foreach (var route in FleetRoutes.Where(r => !RolePermissionMatrix.RoleHas(role.ToString(), r.Permission)))
        {
            var response = await client.SendWithTokenAsync(new HttpMethod(route.Method), Url(route, robotId), token, new { });
            if (response.StatusCode != HttpStatusCode.Forbidden)
            {
                wrong.Add($"{route.Method} {route.Pattern} → {(int)response.StatusCode}");
            }
        }

        Assert.True(wrong.Count == 0, $"{role} was not refused: " + string.Join("; ", wrong));
    }

    [Fact]
    public async Task A_technician_is_refused_on_every_route_of_a_robot_outside_their_scope()
    {
        var foreign = await SeedRobotAsync("RBT-FOREIGN");
        await Factory.CreateAccountAsync("no_scope_tech", AccountRole.TECHNICIAN);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync("no_scope_tech")).AccessToken;

        var wrong = new List<string>();
        foreach (var route in FleetRoutes.Where(r => r.Scoped
                     && RolePermissionMatrix.RoleHas(nameof(AccountRole.TECHNICIAN), r.Permission)))
        {
            var response = await client.SendWithTokenAsync(new HttpMethod(route.Method), Url(route, foreign), token, new { });
            var code = response.StatusCode == HttpStatusCode.Forbidden ? await response.ReadErrorCodeAsync() : null;
            if (code != "robot_out_of_scope")
            {
                wrong.Add($"{route.Method} {route.Pattern} → {(int)response.StatusCode} {code}");
            }
        }

        Assert.True(wrong.Count == 0, "Not refused for scope: " + string.Join("; ", wrong));
    }

    [Fact]
    public async Task A_stop_needs_no_lease_but_driving_does()
    {
        var robotId = await SeedRobotAsync("RBT-STOP", online: true);
        await Factory.CreateAccountAsync("root", AccountRole.ADMIN);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync("root")).AccessToken;

        var stop = await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/fleet/robots/{robotId}/teleop", token, new { linear = 0.0, angular = 0.0 });
        var drive = await client.SendWithTokenAsync(
            HttpMethod.Post, $"/api/fleet/robots/{robotId}/teleop", token, new { linear = 0.1, angular = 0.0 });

        Assert.True(stop.IsSuccessStatusCode, $"stop → {(int)stop.StatusCode}");
        Assert.Equal("manual_lease_required", await drive.ReadErrorCodeAsync());
    }

    [Theory]
    [InlineData(AccountRole.STAFF, "wf_staff")]
    [InlineData(AccountRole.TECHNICIAN, "wf_tech")]
    public async Task Only_an_admin_may_write_or_publish_a_workflow(AccountRole role, string username)
    {
        await Factory.CreateAccountAsync(username, role);
        var client = CreateAnonymousClient();
        var token = (await client.LoginAsync(username)).AccessToken;
        var id = Guid.NewGuid();
        const string root = "/api/workflow-execution/workflows";

        (HttpMethod Method, string Url)[] writes =
        [
            (HttpMethod.Post, root),
            (HttpMethod.Put, $"{root}/{id}"),
            (HttpMethod.Delete, $"{root}/{id}"),
            (HttpMethod.Post, $"{root}/{id}/publish"),
            (HttpMethod.Post, $"{root}/{id}/versions"),
        ];

        foreach (var (method, url) in writes)
        {
            var response = await client.SendWithTokenAsync(method, url, token, new { });
            Assert.True(response.StatusCode == HttpStatusCode.Forbidden, $"{method} {url} → {(int)response.StatusCode}");
        }

        Assert.Equal(HttpStatusCode.OK, (await client.GetWithTokenAsync(root, token)).StatusCode);
    }
}

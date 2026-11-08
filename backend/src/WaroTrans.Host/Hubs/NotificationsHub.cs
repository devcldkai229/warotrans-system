using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Host.Hubs;

/// <summary>
/// Client methods pushed by the server:
/// - robotConnectivityChanged, robotTelemetryUpdated (to the robots the user may see: <see cref="RealtimeGroups.Robot"/>)
/// - jobUpdated (Job / JobStep status change; clients refetch the Job) — users with job.read
/// - notificationCreated (a new item for the notification bell) — users with notification.read
///
/// Group membership is fixed when the connection opens (RTM-01). The connection is closed when the access token
/// expires (<c>CloseOnAuthenticationExpiration</c>), so a reconnect with a fresh token re-evaluates role and robot
/// scope at least once per token lifetime.
/// </summary>
[Authorize]
public sealed class NotificationsHub(IRobotAccessScope robotAccessScope) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var user = Context.User;
        var subject = user?.FindFirstValue(ClaimTypes.NameIdentifier) ?? user?.FindFirstValue(AppClaimTypes.Subject);
        if (user is null || user.IsPasswordChangeRequired() || !Guid.TryParse(subject, out var accountId))
        {
            Context.Abort();
            return;
        }

        var groups = new List<string> { RealtimeGroups.User(accountId) };

        if (RolePermissionMatrix.UserHas(user, Permissions.JobRead))
        {
            groups.Add(RealtimeGroups.Jobs);
        }

        if (RolePermissionMatrix.UserHas(user, Permissions.NotificationRead))
        {
            groups.Add(RealtimeGroups.Notifications);
        }

        if (RolePermissionMatrix.UserHas(user, Permissions.RobotRead))
        {
            var scope = await robotAccessScope.GetForAsync(user, Context.ConnectionAborted);
            if (scope.AllRobots)
            {
                groups.Add(RealtimeGroups.AllRobots);
            }
            else
            {
                groups.AddRange(scope.RobotIds.Select(RealtimeGroups.Robot));
            }
        }

        foreach (var group in groups)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, group, Context.ConnectionAborted);
        }

        await base.OnConnectedAsync();
    }
}

/// <summary>SignalR group names. Producers send to these instead of <c>Clients.All</c>.</summary>
public static class RealtimeGroups
{
    public const string Jobs = "perm:job.read";
    public const string Notifications = "perm:notification.read";

    /// <summary>Everyone who may see the whole fleet (all roles except a scoped Technician).</summary>
    public const string AllRobots = "robots:all";

    public static string Robot(Guid robotId) => $"robot:{robotId:D}";

    public static string User(Guid accountId) => $"user:{accountId:D}";

    /// <summary>Groups that should receive an event about <paramref name="robotId"/>.</summary>
    public static IReadOnlyList<string> ForRobot(Guid robotId) => [AllRobots, Robot(robotId)];
}

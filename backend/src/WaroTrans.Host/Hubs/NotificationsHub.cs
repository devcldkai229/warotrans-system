using Microsoft.AspNetCore.SignalR;

namespace WaroTrans.Host.Hubs;

/// <summary>
/// Client methods pushed by the server:
/// - robotConnectivityChanged
/// - robotTelemetryUpdated
/// - jobUpdated (Job / JobStep status change; clients refetch the Job)
/// - notificationCreated (admins only: a new item for the notification bell)
/// </summary>
public sealed class NotificationsHub : Hub
{
    public const string AdminsGroup = "admins";

    public override async Task OnConnectedAsync()
    {
        if (Context.User?.IsInRole("ADMIN") == true)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, AdminsGroup);
        }

        await base.OnConnectedAsync();
    }
}

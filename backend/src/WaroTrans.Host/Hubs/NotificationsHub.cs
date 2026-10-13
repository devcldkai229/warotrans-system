using Microsoft.AspNetCore.SignalR;

namespace WaroTrans.Host.Hubs;

/// <summary>
/// Client methods pushed by the server:
/// - robotConnectivityChanged
/// - robotTelemetryUpdated
/// </summary>
public sealed class NotificationsHub : Hub
{
}

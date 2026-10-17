using Microsoft.AspNetCore.SignalR;

namespace WaroTrans.Host.Hubs;

/// <summary>
/// Client methods pushed by the server:
/// - robotConnectivityChanged
/// - robotTelemetryUpdated
/// - jobUpdated (Job / JobStep status change; clients refetch the Job)
/// </summary>
public sealed class NotificationsHub : Hub
{
}

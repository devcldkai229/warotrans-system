using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Operations.Enums;

namespace WaroTrans.Operations.Contracts;

/// <summary>Who a notification is for (OPS-03).</summary>
/// <param name="Roles">Everyone with one of these roles, when there is no single <paramref name="AccountId"/>.</param>
/// <param name="AccountId">One person: an assignee, the reporter of an issue.</param>
/// <param name="RobotId">The robot it is about: Technicians only receive it for robots in their scope.</param>
public sealed record NotificationAudience(IReadOnlyList<string> Roles, Guid? AccountId = null, Guid? RobotId = null)
{
    public static readonly NotificationAudience Admins = new([AppRoles.Admin]);

    /// <summary>Something on the warehouse floor: Admins and Staff.</summary>
    public static readonly NotificationAudience Floor = new([AppRoles.Admin, AppRoles.Staff]);

    /// <summary>A robot problem: Admins, and the Technicians assigned to that robot.</summary>
    public static NotificationAudience RobotCare(Guid robotId) => new([AppRoles.Admin, AppRoles.Technician], RobotId: robotId);

    public static NotificationAudience Person(Guid accountId) => new([], accountId);
}

/// <summary>What another part of the system wants someone to hear about.</summary>
/// <param name="Kind">Machine name of the situation, e.g. <c>JOB_FAILED</c>, so the UI can pick an icon or a link.</param>
/// <param name="EntityType">What the notification is about (<c>JOB</c>, <c>ROBOT</c>, <c>REQUEST</c>, <c>ISSUE</c>), for the link.</param>
/// <param name="DedupeKey">
/// The same situation twice (a robot flapping offline) must not fill the bell: while a notification with this key is
/// unread, or was raised moments ago, a new one with the same key is dropped. The key is also what
/// <see cref="INotificationService.ResolveAsync"/> uses to mark the situation as over.
/// </param>
/// <param name="OncePerSituation">
/// For something that lasts until somebody acts (a job nobody started): one notification for the whole time it lasts,
/// however long that is and whether or not it was read, and a new one only after it was resolved. Without it a repeat
/// is also let through again ten minutes after the previous one was read.
/// </param>
/// <param name="Audience">Who receives it; Admins when not given.</param>
public sealed record NotificationDraft(
    NotificationType Type,
    string Kind,
    string Title,
    string Content,
    string? EntityType = null,
    Guid? EntityId = null,
    string? DedupeKey = null,
    bool OncePerSituation = false,
    NotificationAudience? Audience = null);

/// <summary>Public contract of the Operations module for raising notifications.</summary>
public interface INotificationService
{
    /// <returns>The new notification's id, or null when it was dropped as a duplicate.</returns>
    Task<Guid?> PublishAsync(NotificationDraft draft, CancellationToken cancellationToken = default);

    /// <summary>Marks every open notification with this key as resolved (the robot is back, the job moved on).</summary>
    Task ResolveAsync(string dedupeKey, CancellationToken cancellationToken = default);
}

/// <summary>Client routes for the entity a notification is about (SY-04). Web and App share these paths.</summary>
public static class NotificationRoutes
{
    public static string? For(string? entityType, Guid? entityId) =>
        entityId is not { } id
            ? null
            : entityType switch
            {
                "JOB" => $"/monitor/jobs/{id}",
                "REQUEST" => $"/monitor/requests?requestId={id}",
                "ROBOT" => $"/monitor/fleet?robotId={id}",
                "ISSUE" => $"/operations/issues/{id}",
                _ => null
            };
}

/// <summary>A notification was stored. The Host pushes it to the browsers and phones of its audience.</summary>
public sealed record NotificationCreated(
    Guid NotificationId,
    NotificationType Type,
    string Kind,
    string Title,
    string Content,
    string? EntityType,
    Guid? EntityId,
    DateTimeOffset CreatedAt,
    Guid? ReceiverAccountId = null,
    IReadOnlyList<string>? RecipientRoles = null,
    Guid? RobotId = null,
    string? Route = null) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

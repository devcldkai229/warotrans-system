using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Operations.Enums;

namespace WaroTrans.Operations.Contracts;

/// <summary>What another part of the system wants an admin to hear about.</summary>
/// <param name="Kind">Machine name of the situation, e.g. <c>JOB_FAILED</c>, so the UI can pick an icon or a link.</param>
/// <param name="EntityType">What the notification is about (<c>JOB</c>, <c>ROBOT</c>), for the link the UI offers.</param>
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
public sealed record NotificationDraft(
    NotificationType Type,
    string Kind,
    string Title,
    string Content,
    string? EntityType = null,
    Guid? EntityId = null,
    string? DedupeKey = null,
    bool OncePerSituation = false);

/// <summary>Public contract of the Operations module for raising admin notifications.</summary>
public interface INotificationService
{
    /// <returns>The new notification's id, or null when it was dropped as a duplicate.</returns>
    Task<Guid?> PublishAsync(NotificationDraft draft, CancellationToken cancellationToken = default);

    /// <summary>Marks every open notification with this key as resolved (the robot is back, the job moved on).</summary>
    Task ResolveAsync(string dedupeKey, CancellationToken cancellationToken = default);
}

/// <summary>A notification was stored. The Host pushes it to the admins' browsers.</summary>
public sealed record NotificationCreated(
    Guid NotificationId,
    NotificationType Type,
    string Kind,
    string Title,
    string Content,
    string? EntityType,
    Guid? EntityId,
    DateTimeOffset CreatedAt) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

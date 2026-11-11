namespace WaroTrans.Operations.Features.ListNotifications;

/// <param name="UnreadCount">Every unread notification of the caller, whatever the filters.</param>
/// <param name="Total">How many notifications match the filters (`unreadOnly`, `type`, `kind`), for paging.</param>
public sealed record ListNotificationsResponse(int UnreadCount, IReadOnlyList<NotificationDto> Items, int Total = 0);

public sealed record NotificationDto(
    Guid Id,
    string Type,
    string Kind,
    string Title,
    string Content,
    string? EntityType,
    Guid? EntityId,
    DateTimeOffset CreatedAt,
    bool IsRead,
    DateTimeOffset? ReadAt,
    DateTimeOffset? ResolvedAt,
    string? Route = null);

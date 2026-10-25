namespace WaroTrans.Operations.Features.ListNotifications;

public sealed record ListNotificationsResponse(int UnreadCount, IReadOnlyList<NotificationDto> Items);

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
    DateTimeOffset? ResolvedAt);

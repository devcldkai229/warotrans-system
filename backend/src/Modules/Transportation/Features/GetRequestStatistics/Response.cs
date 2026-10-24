namespace WaroTrans.Transportation.Features.GetRequestStatistics;

/// <summary>
/// Transport request numbers for the admin dashboard. Submitted / ByStatus / Daily cover requests submitted in the
/// window; the lead time is for requests that completed in it; <c>Open</c> is every request still in flight right now.
/// </summary>
public sealed record RequestStatisticsResponse(
    DateTimeOffset From,
    DateTimeOffset To,
    int Submitted,
    int PreviousSubmitted,
    int Open,
    double? AvgLeadTimeSeconds,
    IReadOnlyList<RequestStatusCount> ByStatus,
    IReadOnlyList<DailyRequestStatistics> Daily);

public sealed record RequestStatusCount(string Status, int Count);

public sealed record DailyRequestStatistics(DateOnly Date, int Submitted, int Completed);

using WaroTrans.BuildingBlocks.Exceptions;

namespace WaroTrans.BuildingBlocks.Statistics;

/// <summary>
/// The time window a statistics endpoint reports on, shared by every module that has numbers on the admin dashboard.
/// <c>From</c> is inclusive, <c>To</c> exclusive. <c>UtcOffsetMinutes</c> is the viewer's offset from UTC so the
/// per-day buckets follow their calendar days instead of UTC midnight.
/// </summary>
public sealed record StatisticsRange(DateTimeOffset From, DateTimeOffset To, int UtcOffsetMinutes)
{
    public const int DefaultDays = 7;
    public const int MaxDays = 366;

    public TimeSpan Length => To - From;

    /// <summary>The window of the same length right before this one, used for "vs previous period" deltas.</summary>
    public DateTimeOffset PreviousFrom => From - Length;

    public bool Contains(DateTimeOffset instant) => instant >= From && instant < To;

    public bool ContainsPrevious(DateTimeOffset instant) => instant >= PreviousFrom && instant < From;

    public static StatisticsRange Resolve(
        DateTimeOffset? from,
        DateTimeOffset? to,
        int? utcOffsetMinutes,
        DateTimeOffset now)
    {
        var end = to ?? now;
        var start = from ?? end.AddDays(-DefaultDays);

        if (start >= end)
        {
            throw new DomainValidationException("'from' must be earlier than 'to'.", "statistics_range_invalid");
        }

        if (end - start > TimeSpan.FromDays(MaxDays))
        {
            throw new DomainValidationException(
                $"A statistics range can span at most {MaxDays} days.",
                "statistics_range_too_long");
        }

        return new StatisticsRange(start, end, Math.Clamp(utcOffsetMinutes ?? 0, -14 * 60, 14 * 60));
    }

    public DateOnly LocalDate(DateTimeOffset instant) =>
        DateOnly.FromDateTime(instant.ToOffset(TimeSpan.FromMinutes(UtcOffsetMinutes)).DateTime);

    /// <summary>Every calendar day (in the viewer's offset) the range touches, oldest first.</summary>
    public IReadOnlyList<DateOnly> LocalDays()
    {
        var first = LocalDate(From);
        var last = LocalDate(To.AddTicks(-1));
        var days = new List<DateOnly>();
        for (var day = first; day <= last; day = day.AddDays(1))
        {
            days.Add(day);
        }

        return days;
    }
}

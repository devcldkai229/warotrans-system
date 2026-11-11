using WaroTrans.Transportation.Entities;

namespace WaroTrans.Transportation.Services;

/// <summary>When a schedule runs next, on the wall clock of its timezone.</summary>
public static class ScheduleOccurrences
{
    private const int MaxDaysAhead = 8;

    /// <returns>The first occurrence strictly after <paramref name="after"/>, or null when none is left.</returns>
    public static DateTimeOffset? NextAfter(TransportSchedule schedule, DateTimeOffset after)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(schedule.Timezone);
        var next = NextUnbounded(schedule, after, zone);
        return next is { } at && (schedule.EndsAt is null || at <= schedule.EndsAt) ? at : null;
    }

    private static DateTimeOffset? NextUnbounded(TransportSchedule schedule, DateTimeOffset after, TimeZoneInfo zone)
    {
        if (schedule.Recurrence == ScheduleRecurrence.ONCE)
        {
            var once = ToInstant(schedule.StartDate, schedule.LocalTime, zone);
            return once > after ? once : null;
        }

        var localDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(after, zone).DateTime);
        var first = localDate > schedule.StartDate ? localDate : schedule.StartDate;
        for (var day = 0; day <= MaxDaysAhead; day++)
        {
            var date = first.AddDays(day);
            if (schedule.Recurrence == ScheduleRecurrence.WEEKLY && (schedule.DaysOfWeekMask & (1 << (int)date.DayOfWeek)) == 0)
            {
                continue;
            }

            var at = ToInstant(date, schedule.LocalTime, zone);
            if (at > after)
            {
                return at;
            }
        }

        return null;
    }

    private static DateTimeOffset ToInstant(DateOnly date, TimeOnly time, TimeZoneInfo zone)
    {
        var local = date.ToDateTime(time, DateTimeKind.Unspecified);

        // A wall clock skipped by daylight saving runs an hour later rather than never.
        if (zone.IsInvalidTime(local))
        {
            local = local.AddHours(1);
        }

        return new DateTimeOffset(local, zone.GetUtcOffset(local)).ToUniversalTime();
    }
}

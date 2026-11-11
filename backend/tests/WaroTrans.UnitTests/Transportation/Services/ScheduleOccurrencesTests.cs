using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Services;

namespace WaroTrans.UnitTests.Transportation.Services;

public sealed class ScheduleOccurrencesTests
{
    private static TransportSchedule Schedule(ScheduleRecurrence recurrence, int mask = 0, DateTimeOffset? endsAt = null) =>
        new()
        {
            Recurrence = recurrence,
            LocalTime = new TimeOnly(8, 30),
            StartDate = new DateOnly(2026, 11, 9),
            DaysOfWeekMask = mask,
            Timezone = "Asia/Ho_Chi_Minh",
            EndsAt = endsAt
        };

    private static DateTimeOffset Utc(int day, int hour, int minute = 0) => new(2026, 11, day, hour, minute, 0, TimeSpan.Zero);

    [Fact]
    public void Daily_runs_on_the_wall_clock_of_its_timezone()
    {
        // 08:30 in Ho Chi Minh is 01:30 UTC.
        Assert.Equal(Utc(9, 1, 30), ScheduleOccurrences.NextAfter(Schedule(ScheduleRecurrence.DAILY), Utc(9, 0)));
        Assert.Equal(Utc(10, 1, 30), ScheduleOccurrences.NextAfter(Schedule(ScheduleRecurrence.DAILY), Utc(9, 1, 30)));
    }

    [Fact]
    public void Daily_does_not_run_before_its_start_date()
    {
        Assert.Equal(Utc(9, 1, 30), ScheduleOccurrences.NextAfter(Schedule(ScheduleRecurrence.DAILY), Utc(1, 0)));
    }

    [Fact]
    public void Once_runs_one_time()
    {
        var schedule = Schedule(ScheduleRecurrence.ONCE);

        Assert.Equal(Utc(9, 1, 30), ScheduleOccurrences.NextAfter(schedule, Utc(8, 0)));
        Assert.Null(ScheduleOccurrences.NextAfter(schedule, Utc(9, 1, 30)));
    }

    [Fact]
    public void Weekly_runs_only_on_its_days()
    {
        // 2026-11-09 is a Monday; only Wednesdays and Fridays.
        var schedule = Schedule(ScheduleRecurrence.WEEKLY, (1 << (int)DayOfWeek.Wednesday) | (1 << (int)DayOfWeek.Friday));

        Assert.Equal(Utc(11, 1, 30), ScheduleOccurrences.NextAfter(schedule, Utc(9, 0)));
        Assert.Equal(Utc(13, 1, 30), ScheduleOccurrences.NextAfter(schedule, Utc(11, 1, 30)));
        Assert.Equal(Utc(18, 1, 30), ScheduleOccurrences.NextAfter(schedule, Utc(13, 1, 30)));
    }

    [Fact]
    public void Nothing_runs_after_the_end()
    {
        var schedule = Schedule(ScheduleRecurrence.DAILY, endsAt: Utc(10, 1, 30));

        Assert.Equal(Utc(10, 1, 30), ScheduleOccurrences.NextAfter(schedule, Utc(9, 1, 30)));
        Assert.Null(ScheduleOccurrences.NextAfter(schedule, Utc(10, 1, 30)));
    }
}

using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Operations.Enums;
using WaroTrans.Operations.Features.IssueReports;

namespace WaroTrans.UnitTests.Operations;

public sealed class IssueListFiltersTests
{
    private static readonly DateTimeOffset Day = new(2026, 11, 20, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public void A_range_with_one_end_or_both_in_order_is_accepted()
    {
        IssueListFilters.EnsureReportedRange(null, null);
        IssueListFilters.EnsureReportedRange(Day, null);
        IssueListFilters.EnsureReportedRange(null, Day);
        IssueListFilters.EnsureReportedRange(Day, Day.AddDays(1));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void A_range_ending_at_or_before_its_start_is_refused(int days)
    {
        var error = Assert.Throws<DomainValidationException>(() => IssueListFilters.EnsureReportedRange(Day, Day.AddDays(days)));

        Assert.Equal("issue_reported_range_invalid", error.Code);
    }

    [Fact]
    public void Counts_name_every_type_with_zero_for_the_missing_ones()
    {
        var counts = IssueListFilters.CountsByType([KeyValuePair.Create(IssueType.JOB, 8L), KeyValuePair.Create(IssueType.TRANSPORT, 5L)]);

        Assert.Equal(["CONTAINER", "TRANSPORT", "JOB", "ROBOT", "STORAGE", "OTHER"], counts.Keys);
        Assert.Equal(8, counts["JOB"]);
        Assert.Equal(5, counts["TRANSPORT"]);
        Assert.Equal(0, counts["CONTAINER"]);
    }
}

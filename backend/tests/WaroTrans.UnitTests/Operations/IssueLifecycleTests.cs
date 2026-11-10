using WaroTrans.Operations.Contracts;
using WaroTrans.Operations.Enums;
using WaroTrans.Operations.Features.IssueReports;

namespace WaroTrans.UnitTests.Operations;

public class IssueLifecycleTests
{
    [Theory]
    [InlineData(IssueStatus.OPEN, IssueStatus.ACKNOWLEDGED, true)]
    [InlineData(IssueStatus.ACKNOWLEDGED, IssueStatus.IN_PROGRESS, true)]
    [InlineData(IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED, true)]
    [InlineData(IssueStatus.RESOLVED, IssueStatus.IN_PROGRESS, true)] // reopen
    [InlineData(IssueStatus.RESOLVED, IssueStatus.CLOSED, true)]
    [InlineData(IssueStatus.IN_PROGRESS, IssueStatus.OPEN, false)]
    [InlineData(IssueStatus.CLOSED, IssueStatus.IN_PROGRESS, false)]
    [InlineData(IssueStatus.OPEN, IssueStatus.OPEN, false)]
    public void Only_listed_moves_are_allowed(IssueStatus from, IssueStatus to, bool allowed) =>
        Assert.Equal(allowed, IssueLifecycle.CanMove(from, to));

    [Fact]
    public void Closed_is_final() => Assert.Empty(IssueLifecycle.NextOf(IssueStatus.CLOSED));

    [Theory]
    [InlineData("JOB", "/monitor/jobs/")]
    [InlineData("REQUEST", "/monitor/requests?requestId=")]
    [InlineData("ROBOT", "/monitor/fleet?robotId=")]
    [InlineData("ISSUE", "/operations/issues/")]
    public void Notifications_link_to_the_entity_screen(string entityType, string prefix)
    {
        var id = Guid.NewGuid();
        Assert.Equal(prefix + id, NotificationRoutes.For(entityType, id));
    }

    [Fact]
    public void Unknown_or_missing_entity_has_no_link()
    {
        Assert.Null(NotificationRoutes.For("CONTAINER", Guid.NewGuid()));
        Assert.Null(NotificationRoutes.For("JOB", null));
    }
}

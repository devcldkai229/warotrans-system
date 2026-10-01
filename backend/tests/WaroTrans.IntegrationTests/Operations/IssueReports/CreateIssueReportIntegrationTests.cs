using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Operations.IssueReports;

[Collection(IntegrationCollection.Name)]
public sealed class CreateIssueReportIntegrationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact(Skip = "CreateIssueReport API not implemented yet")]
    public Task Post_issue_report_persists_mongo_document()
    {
        return Task.CompletedTask;
    }
}

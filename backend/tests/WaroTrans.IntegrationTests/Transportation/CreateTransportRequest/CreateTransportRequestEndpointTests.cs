using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Transportation.CreateTransportRequest;

/// <summary>
/// Placeholder for POST /api/transport-requests end-to-end coverage once the feature ships.
/// Validation edge cases belong in UnitTests; this class covers HTTP → EF → PostgreSQL.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class CreateTransportRequestEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact(Skip = "CreateTransportRequest Minimal API not implemented yet")]
    public Task Post_transport_request_persists_submitted_request()
    {
        return Task.CompletedTask;
    }
}

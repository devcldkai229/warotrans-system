using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Transportation.CreateTransportRequest;

/// <summary>
/// Placeholder for POST /api/transport-requests end-to-end coverage once the feature ships.
/// Expects TransportRequest + N TransportRequestDetail rows (not TransportData JSONB).
/// Validation edge cases belong in UnitTests; this class covers HTTP → EF → PostgreSQL.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class CreateTransportRequestEndpointTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact(Skip = "CreateTransportRequest Minimal API not implemented yet — expect Details, not TransportData")]
    public Task Post_transport_request_persists_request_with_details()
    {
        return Task.CompletedTask;
    }
}

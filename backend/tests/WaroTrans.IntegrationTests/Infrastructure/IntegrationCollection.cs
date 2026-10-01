[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace WaroTrans.IntegrationTests.Infrastructure;

[CollectionDefinition(Name)]
public sealed class IntegrationCollection : ICollectionFixture<WaroTransWebApplicationFactory>
{
    public const string Name = "Integration";
}

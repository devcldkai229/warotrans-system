using NetArchTest.Rules;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Fleet;
using WaroTrans.Identity;
using WaroTrans.Warehouse;

namespace WaroTrans.ArchitectureTests;

public class NamingConventionTests
{
    [Fact]
    public void DbContexts_reside_in_Persistence_namespace()
    {
        var result = Types.InAssemblies(
            [
                typeof(IdentityModule).Assembly,
                typeof(WarehouseModule).Assembly,
                typeof(FleetModule).Assembly
            ])
            .That()
            .HaveNameEndingWith("DbContext")
            .Should()
            .ResideInNamespaceContaining(".Persistence")
            .GetResult();

        Assert.True(
            result.IsSuccessful,
            result.FailingTypes is null
                ? "Architecture rule failed."
                : string.Join(", ", result.FailingTypes.Select(t => t.FullName)));
    }

    [Fact]
    public void ICurrentUser_lives_in_Abstractions_namespace()
    {
        Assert.Equal("WaroTrans.BuildingBlocks.Abstractions", typeof(ICurrentUser).Namespace);
    }
}

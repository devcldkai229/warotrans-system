using NetArchTest.Rules;
using WaroTrans.Fleet;
using WaroTrans.Identity;
using WaroTrans.Navigation;
using WaroTrans.Operations;
using WaroTrans.Transportation;
using WaroTrans.Warehouse;
using WaroTrans.WorkflowExecution;

namespace WaroTrans.ArchitectureTests;

public class HostDependencyTests
{
    private static readonly System.Reflection.Assembly[] ModuleAssemblies =
    [
        typeof(IdentityModule).Assembly,
        typeof(WarehouseModule).Assembly,
        typeof(TransportationModule).Assembly,
        typeof(WorkflowExecutionModule).Assembly,
        typeof(FleetModule).Assembly,
        typeof(NavigationModule).Assembly,
        typeof(OperationsModule).Assembly
    ];

    [Fact]
    public void Modules_must_not_reference_Host()
    {
        var result = Types.InAssemblies(ModuleAssemblies)
            .ShouldNot()
            .HaveDependencyOn("WaroTrans.Host")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    private static string Format(TestResult result) =>
        result.FailingTypes is null
            ? "Architecture rule failed."
            : string.Join(", ", result.FailingTypes.Select(t => t.FullName));
}

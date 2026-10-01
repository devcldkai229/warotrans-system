using NetArchTest.Rules;
using WaroTrans.Fleet;
using WaroTrans.Identity;
using WaroTrans.Navigation;
using WaroTrans.Operations;
using WaroTrans.Transportation;
using WaroTrans.Warehouse;
using WaroTrans.WorkflowExecution;

namespace WaroTrans.ArchitectureTests;

public class ModuleDependencyTests
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
    public void Modules_must_not_reference_other_module_Persistence()
    {
        var forbidden = new[]
        {
            "WaroTrans.Identity.Persistence",
            "WaroTrans.Warehouse.Persistence",
            "WaroTrans.Transportation.Persistence",
            "WaroTrans.WorkflowExecution.Persistence",
            "WaroTrans.Fleet.Persistence",
            "WaroTrans.Navigation.Persistence",
            "WaroTrans.Operations.Persistence"
        };

        foreach (var assembly in ModuleAssemblies)
        {
            var ownPersistence = $"{assembly.GetName().Name}.Persistence";
            var others = forbidden.Where(ns => !ns.Equals(ownPersistence, StringComparison.Ordinal)).ToArray();

            var result = Types.InAssembly(assembly)
                .ShouldNot()
                .HaveDependencyOnAny(others)
                .GetResult();

            Assert.True(result.IsSuccessful, $"{assembly.GetName().Name}: {Format(result)}");
        }
    }

    [Fact]
    public void Transportation_must_not_depend_on_Warehouse_Persistence()
    {
        var result = Types.InAssembly(typeof(TransportationModule).Assembly)
            .ShouldNot()
            .HaveDependencyOn("WaroTrans.Warehouse.Persistence")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    [Fact]
    public void Fleet_must_not_depend_on_WorkflowExecution_Persistence()
    {
        var result = Types.InAssembly(typeof(FleetModule).Assembly)
            .ShouldNot()
            .HaveDependencyOn("WaroTrans.WorkflowExecution.Persistence")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    private static string Format(TestResult result) =>
        result.FailingTypes is null
            ? "Architecture rule failed."
            : string.Join(", ", result.FailingTypes.Select(t => t.FullName));
}

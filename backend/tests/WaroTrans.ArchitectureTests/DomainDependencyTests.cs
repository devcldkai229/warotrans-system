using NetArchTest.Rules;
using WaroTrans.Fleet;
using WaroTrans.Identity;
using WaroTrans.Navigation;
using WaroTrans.Operations;
using WaroTrans.Transportation;
using WaroTrans.Warehouse;
using WaroTrans.WorkflowExecution;

namespace WaroTrans.ArchitectureTests;

public class DomainDependencyTests
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
    public void Entity_types_must_not_depend_on_AspNetCore()
    {
        var result = Types.InAssemblies(ModuleAssemblies)
            .That()
            .ResideInNamespaceContaining(".Entities")
            .ShouldNot()
            .HaveDependencyOnAny("Microsoft.AspNetCore", "Microsoft.AspNetCore.Http")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    [Fact]
    public void Entity_types_must_not_depend_on_EF_Core()
    {
        var result = Types.InAssemblies(ModuleAssemblies)
            .That()
            .ResideInNamespaceContaining(".Entities")
            .ShouldNot()
            .HaveDependencyOn("Microsoft.EntityFrameworkCore")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    private static string Format(TestResult result) =>
        result.FailingTypes is null
            ? "Architecture rule failed."
            : string.Join(", ", result.FailingTypes.Select(t => t.FullName));
}

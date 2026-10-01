using NetArchTest.Rules;
using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.ArchitectureTests;

public class BuildingBlocksDependencyTests
{
    [Fact]
    public void BuildingBlocks_must_not_depend_on_modules_or_Host()
    {
        var result = Types.InAssembly(typeof(ICurrentUser).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny(
                "WaroTrans.Host",
                "WaroTrans.Identity",
                "WaroTrans.Warehouse",
                "WaroTrans.Transportation",
                "WaroTrans.WorkflowExecution",
                "WaroTrans.Fleet",
                "WaroTrans.Navigation",
                "WaroTrans.Operations")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    private static string Format(TestResult result) =>
        result.FailingTypes is null
            ? "Architecture rule failed."
            : string.Join(", ", result.FailingTypes.Select(t => t.FullName));
}

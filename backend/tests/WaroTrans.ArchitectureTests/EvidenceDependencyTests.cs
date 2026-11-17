using System.Reflection;
using NetArchTest.Rules;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder;

namespace WaroTrans.ArchitectureTests;

/// <summary>
/// docs/adr/0012: Evidence is its own bounded context in its own processes. It never reaches into the modular monolith
/// (only the HTTP contracts of the EvidenceBridge), and the Worker never depends on the Recorder (separate deployments).
/// </summary>
public class EvidenceDependencyTests
{
    private static readonly string[] Monolith =
    [
        "WaroTrans.Host",
        "WaroTrans.Identity",
        "WaroTrans.Warehouse",
        "WaroTrans.Transportation",
        "WaroTrans.WorkflowExecution",
        "WaroTrans.Fleet",
        "WaroTrans.Navigation",
        "WaroTrans.Operations",
        "WaroTrans.EvidenceBridge"
    ];

    private static Assembly Shared => typeof(EvidenceDbContext).Assembly;
    private static Assembly Recorder => typeof(RecorderOptions).Assembly;
    private static Assembly Worker => Assembly.Load("WaroTrans.Evidence.Worker");

    [Fact]
    public void Evidence_does_not_depend_on_the_monolith()
    {
        var result = Types.InAssemblies([Shared, Recorder, Worker])
            .ShouldNot()
            .HaveDependencyOnAny(Monolith)
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    [Fact]
    public void The_shared_model_depends_on_neither_process_nor_BuildingBlocks()
    {
        var result = Types.InAssembly(Shared)
            .ShouldNot()
            .HaveDependencyOnAny("WaroTrans.Evidence.Recorder", "WaroTrans.Evidence.Worker", "WaroTrans.BuildingBlocks", "Microsoft.AspNetCore")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    [Fact]
    public void The_worker_does_not_depend_on_the_recorder()
    {
        var result = Types.InAssembly(Worker)
            .ShouldNot()
            .HaveDependencyOn("WaroTrans.Evidence.Recorder")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    [Fact]
    public void Evidence_entities_do_not_depend_on_EF_or_AspNetCore()
    {
        var result = Types.InAssembly(Shared)
            .That()
            .ResideInNamespace("WaroTrans.Evidence.Entities")
            .ShouldNot()
            .HaveDependencyOnAny("Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    [Fact]
    public void The_monolith_does_not_depend_on_Evidence()
    {
        var result = Types.InAssembly(typeof(WaroTrans.EvidenceBridge.EvidenceBridgeModule).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny("WaroTrans.Evidence.Recorder", "WaroTrans.Evidence.Worker", "WaroTrans.Evidence.Persistence", "WaroTrans.Evidence.Entities")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    private static string Format(TestResult result) =>
        result.FailingTypes is null
            ? "Architecture rule failed."
            : string.Join(", ", result.FailingTypes.Select(t => t.FullName));
}

using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.WorkflowExecution.Fixtures;
using WaroTrans.WorkflowExecution.Runtime;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.UnitTests.WorkflowExecution.Runtime;

public class SystemVariableResolverTests
{
    private readonly SystemVariableResolver _resolver = new();
    private readonly WorkflowVariableContextBuilder _builder = new(new SystemVariableResolver());

    [Fact]
    public void TryResolve_job_and_request_ids()
    {
        var jobId = Guid.NewGuid();
        var requestId = Guid.NewGuid();
        var ctx = new WorkflowRuntimeContext { JobId = jobId, TransportRequestId = requestId };

        Assert.True(_resolver.TryResolve("jobId", ctx, out var jobEl));
        Assert.Equal(jobId, jobEl.GetGuid());
        Assert.True(_resolver.TryResolve("transportRequestId", ctx, out var reqEl));
        Assert.Equal(requestId, reqEl.GetGuid());
    }

    [Fact]
    public void TryResolve_assignedRobotId_missing_returns_false()
    {
        var ctx = new WorkflowRuntimeContext
        {
            JobId = Guid.NewGuid(),
            TransportRequestId = Guid.NewGuid(),
            AssignedRobotId = null
        };

        Assert.False(_resolver.TryResolve("assignedRobotId", ctx, out _));
    }

    [Fact]
    public void ContextBuilder_throws_when_required_assignedRobotId_missing()
    {
        var model = InternalRelocationWorkflowFactory.CreateValid();

        var ex = Assert.Throws<DomainValidationException>(() =>
            _builder.Build(
                model.Variables,
                new Dictionary<string, System.Text.Json.JsonElement>(),
                new WorkflowRuntimeContext
                {
                    JobId = Guid.NewGuid(),
                    TransportRequestId = Guid.NewGuid(),
                    AssignedRobotId = null
                }));

        Assert.Equal("workflow_variable_missing", ex.Code);
        Assert.Contains("assignedRobotId", ex.Message, StringComparison.Ordinal);
    }
}

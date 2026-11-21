using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Services;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.UnitTests.WorkflowExecution.Services;

public sealed class WorkflowFixedStopsTests
{
    private static readonly Guid Inbound = Guid.NewGuid();
    private static readonly Guid Outbound = Guid.NewGuid();
    private static readonly Guid Shelf = Guid.NewGuid();

    private static StepInputBinding Var(string key) => new() { SourceType = BindingSourceType.WORKFLOW_VAR, SourceReference = key };

    private static StepInputBinding Movement(string path) => new() { SourceType = BindingSourceType.CURRENT_MOVEMENT, SourceReference = path };

    private static StepInputBinding Constant(Guid id) => new() { SourceType = BindingSourceType.CONSTANT, ConstantValue = JsonSerializer.SerializeToElement(id) };

    private static WorkflowDefinitionModel Workflow(StepInputBinding pickup, StepInputBinding dropoff, params WorkflowVariableDefinition[] variables) => new()
    {
        Code = "TEST",
        Variables = [.. variables],
        Tasks =
        [
            new WorkflowTaskModel
            {
                TaskKey = "COLLECT", SequenceNo = 1,
                Steps = [new WorkflowStepModel { StepKey = "MOVE_PICKUP", StepType = StepType.MOVE, OperationCode = "PICKUP", InputBindings = new() { ["targetEndpointId"] = pickup } }]
            },
            new WorkflowTaskModel
            {
                TaskKey = "DELIVER", SequenceNo = 2,
                Steps = [new WorkflowStepModel { StepKey = "MOVE_DROPOFF", StepType = StepType.MOVE, OperationCode = "DROPOFF", InputBindings = new() { ["targetEndpointId"] = dropoff } }]
            }
        ]
    };

    private static WorkflowVariableDefinition Admin(string key, Guid? value) => new()
    {
        Key = key,
        DataType = WorkflowDataType.UUID,
        Source = WorkflowVariableSource.ADMIN_INPUT,
        ConfiguredValue = value is null ? null : JsonSerializer.SerializeToElement(value.Value)
    };

    private static TransportRequestDetailSnapshot Detail(Guid source, Guid destination) =>
        new(Guid.NewGuid(), 1, Guid.NewGuid(), null, source, null, null, destination, null);

    [Fact]
    public void Movement_bound_steps_fix_nothing()
    {
        var model = Workflow(Movement("source.endpointId"), Movement("destination.endpointId"));

        Assert.Equal(new WorkflowFixedStops.FixedStops(null, null), WorkflowFixedStops.Resolve(model));
        WorkflowFixedStops.Ensure(model, [Detail(Shelf, Outbound)]);
    }

    [Fact]
    public void Admin_variable_fixes_the_pickup_and_a_request_must_start_there()
    {
        var model = Workflow(Var("inboundEndpointId"), Movement("destination.endpointId"), Admin("inboundEndpointId", Inbound));

        Assert.Equal(Inbound, WorkflowFixedStops.Resolve(model).PickupEndpointId);
        WorkflowFixedStops.Ensure(model, [Detail(Inbound, Shelf)]);
        var error = Assert.Throws<DomainValidationException>(() => WorkflowFixedStops.Ensure(model, [Detail(Shelf, Outbound)]));
        Assert.Equal("workflow_pickup_endpoint_fixed", error.Code);
    }

    [Fact]
    public void Constant_fixes_the_dropoff_and_a_request_must_end_there()
    {
        var model = Workflow(Movement("source.endpointId"), Constant(Outbound));

        Assert.Equal(Outbound, WorkflowFixedStops.Resolve(model).DropoffEndpointId);
        WorkflowFixedStops.Ensure(model, [Detail(Shelf, Outbound)]);
        var error = Assert.Throws<DomainValidationException>(() => WorkflowFixedStops.Ensure(model, [Detail(Shelf, Inbound)]));
        Assert.Equal("workflow_dropoff_endpoint_fixed", error.Code);
    }

    [Fact]
    public void A_variable_without_a_configured_value_or_from_staff_fixes_nothing()
    {
        var staff = new WorkflowVariableDefinition { Key = "pickAt", DataType = WorkflowDataType.UUID, Source = WorkflowVariableSource.STAFF_INPUT };
        var model = Workflow(Var("pickAt"), Var("dropAt"), staff, Admin("dropAt", null));

        Assert.Equal(new WorkflowFixedStops.FixedStops(null, null), WorkflowFixedStops.Resolve(model));
    }
}

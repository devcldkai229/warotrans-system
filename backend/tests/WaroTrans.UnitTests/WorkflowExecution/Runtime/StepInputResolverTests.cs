using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.WorkflowExecution.Fixtures;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Runtime;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.UnitTests.WorkflowExecution.Runtime;

public class StepInputResolverTests
{
    private readonly StepInputResolver _resolver = new();
    private readonly WorkflowVariableContextBuilder _contextBuilder = new(new SystemVariableResolver());

    [Fact]
    public void Resolve_inbound_putaway_steps_produce_expected_inputs()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();
        var robotId = Guid.NewGuid();
        var containerId = Guid.NewGuid();
        var sourceEndpointId = Guid.NewGuid();
        var destinationEndpointId = Guid.NewGuid();
        var jobId = Guid.NewGuid();
        var requestId = Guid.NewGuid();

        var staff = new Dictionary<string, JsonElement>
        {
            ["containerId"] = JsonSerializer.SerializeToElement(containerId),
            ["sourceEndpointId"] = JsonSerializer.SerializeToElement(sourceEndpointId),
            ["destinationEndpointId"] = JsonSerializer.SerializeToElement(destinationEndpointId)
        };

        var variableContext = _contextBuilder.Build(
            model.Variables,
            staff,
            new WorkflowRuntimeContext
            {
                AssignedRobotId = robotId,
                JobId = jobId,
                TransportRequestId = requestId
            });

        Assert.Equal(30m, variableContext["minBatteryPercent"].GetDecimal());
        Assert.Equal(robotId, variableContext["assignedRobotId"].GetGuid());

        var checkBattery = model.Tasks[0].Steps.First(s => s.StepKey == "CHECK_BATTERY");
        var batteryInputs = _resolver.Resolve(
            checkBattery.StepType,
            checkBattery.OperationCode,
            checkBattery.InputBindings,
            variableContext,
            null,
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());

        Assert.Equal(robotId, batteryInputs["robotId"].GetGuid());
        Assert.Equal(30m, batteryInputs["minimumBatteryPercent"].GetDecimal());

        var movePickup = model.Tasks[0].Steps.First(s => s.StepKey == "MOVE_PICKUP");
        var moveInputs = _resolver.Resolve(
            movePickup.StepType,
            movePickup.OperationCode,
            movePickup.InputBindings,
            variableContext,
            null,
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());

        Assert.Equal(sourceEndpointId, moveInputs["targetEndpointId"].GetGuid());
        Assert.Equal("PICKUP", moveInputs["purpose"].GetString());

        var dropoff = model.Tasks[1].Steps.First(s => s.StepKey == "DROPOFF_CONFIRM");
        var dropoffInputs = _resolver.Resolve(
            dropoff.StepType,
            dropoff.OperationCode,
            dropoff.InputBindings,
            variableContext,
            null,
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());

        Assert.Equal(containerId, dropoffInputs["containerId"].GetGuid());
        Assert.Equal(destinationEndpointId, dropoffInputs["endpointId"].GetGuid());
    }

    [Fact]
    public void Resolve_current_movement_path()
    {
        var bindings = new Dictionary<string, StepInputBinding>
        {
            ["endpointId"] = new StepInputBinding
            {
                SourceType = BindingSourceType.CURRENT_MOVEMENT,
                SourceReference = "source.endpointId"
            }
        };

        // ENDPOINT_AVAILABLE only needs endpointId — use CHECK
        var endpointId = Guid.NewGuid();
        var resolved = _resolver.Resolve(
            StepType.CHECK,
            "ENDPOINT_AVAILABLE",
            bindings,
            new Dictionary<string, JsonElement>(),
            new CurrentMovementContext { SourceEndpointId = endpointId },
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());

        Assert.Equal(endpointId, resolved["endpointId"].GetGuid());
    }

    [Fact]
    public void Resolve_step_output_from_earlier_step()
    {
        var confirmedBy = Guid.NewGuid();
        var bindings = new Dictionary<string, StepInputBinding>
        {
            ["robotId"] = new StepInputBinding
            {
                SourceType = BindingSourceType.STEP_OUTPUT,
                SourceReference = "PICKUP_CONFIRM",
                OutputKey = "confirmedBy"
            }
        };

        var earlier = new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>
        {
            ["PICKUP_CONFIRM"] = new Dictionary<string, JsonElement>
            {
                ["confirmedBy"] = JsonSerializer.SerializeToElement(confirmedBy)
            }
        };

        var resolved = _resolver.Resolve(
            StepType.CHECK,
            "ROBOT_READY",
            bindings,
            new Dictionary<string, JsonElement>(),
            null,
            earlier);

        Assert.Equal(confirmedBy, resolved["robotId"].GetGuid());
    }

    [Fact]
    public void ContextBuilder_throws_when_required_staff_input_missing()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();

        Assert.Throws<DomainValidationException>(() =>
            _contextBuilder.Build(
                model.Variables,
                new Dictionary<string, JsonElement>(),
                new WorkflowRuntimeContext
                {
                    AssignedRobotId = Guid.NewGuid(),
                    JobId = Guid.NewGuid(),
                    TransportRequestId = Guid.NewGuid()
                }));
    }
}

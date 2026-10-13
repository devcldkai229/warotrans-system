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

        var variableContext = _contextBuilder.Build(
            model.Variables,
            new Dictionary<string, JsonElement>(),
            new WorkflowRuntimeContext
            {
                AssignedRobotId = robotId,
                JobId = jobId,
                TransportRequestId = requestId
            });

        Assert.Equal(30m, variableContext["minBatteryPercent"].GetDecimal());
        Assert.Equal(robotId, variableContext["assignedRobotId"].GetGuid());

        var movement = new CurrentMovementContext
        {
            ContainerId = containerId,
            SourceEndpointId = sourceEndpointId,
            DestinationEndpointId = destinationEndpointId
        };

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
            movement,
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());

        Assert.Equal(sourceEndpointId, moveInputs["targetEndpointId"].GetGuid());
        Assert.Equal("PICKUP", moveInputs["purpose"].GetString());

        var dropoff = model.Tasks[1].Steps.First(s => s.StepKey == "DROPOFF_CONFIRM");
        var dropoffInputs = _resolver.Resolve(
            dropoff.StepType,
            dropoff.OperationCode,
            dropoff.InputBindings,
            variableContext,
            movement,
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
    public void Resolve_internal_relocation_uses_admin_system_and_current_movement()
    {
        var model = InternalRelocationWorkflowFactory.CreateValid();
        var robotId = Guid.NewGuid();
        var containerId = Guid.NewGuid();
        var sourceEndpointId = Guid.NewGuid();
        var destinationEndpointId = Guid.NewGuid();
        var jobId = Guid.NewGuid();
        var requestId = Guid.NewGuid();

        var variableContext = _contextBuilder.Build(
            model.Variables,
            new Dictionary<string, JsonElement>(),
            new WorkflowRuntimeContext
            {
                AssignedRobotId = robotId,
                JobId = jobId,
                TransportRequestId = requestId
            });

        Assert.Equal(25m, variableContext["minBatteryPercent"].GetDecimal());
        Assert.Equal(robotId, variableContext["assignedRobotId"].GetGuid());
        Assert.Equal(requestId, variableContext["transportRequestId"].GetGuid());
        Assert.Equal(jobId, variableContext["jobId"].GetGuid());

        var movement = new CurrentMovementContext
        {
            ContainerId = containerId,
            SourceEndpointId = sourceEndpointId,
            DestinationEndpointId = destinationEndpointId
        };

        var checkBattery = model.Tasks[0].Steps.First(s => s.StepKey == "CHECK_BATTERY");
        var batteryInputs = _resolver.Resolve(
            checkBattery.StepType,
            checkBattery.OperationCode,
            checkBattery.InputBindings,
            variableContext,
            null,
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());
        Assert.Equal(robotId, batteryInputs["robotId"].GetGuid());
        Assert.Equal(25m, batteryInputs["minimumBatteryPercent"].GetDecimal());

        var movePickup = model.Tasks[0].Steps.First(s => s.StepKey == "MOVE_PICKUP");
        var moveInputs = _resolver.Resolve(
            movePickup.StepType,
            movePickup.OperationCode,
            movePickup.InputBindings,
            variableContext,
            movement,
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());
        Assert.Equal(sourceEndpointId, moveInputs["targetEndpointId"].GetGuid());
        Assert.Equal("PICKUP", moveInputs["purpose"].GetString());

        var pickupConfirm = model.Tasks[0].Steps.First(s => s.StepKey == "PICKUP_CONFIRM");
        var pickupInputs = _resolver.Resolve(
            pickupConfirm.StepType,
            pickupConfirm.OperationCode,
            pickupConfirm.InputBindings,
            variableContext,
            movement,
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());
        Assert.Equal(containerId, pickupInputs["containerId"].GetGuid());
        Assert.Equal(sourceEndpointId, pickupInputs["endpointId"].GetGuid());

        var dropoff = model.Tasks[1].Steps.First(s => s.StepKey == "DROPOFF_CONFIRM");
        var dropoffInputs = _resolver.Resolve(
            dropoff.StepType,
            dropoff.OperationCode,
            dropoff.InputBindings,
            variableContext,
            movement,
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());
        Assert.Equal(containerId, dropoffInputs["containerId"].GetGuid());
        Assert.Equal(destinationEndpointId, dropoffInputs["endpointId"].GetGuid());
    }

    [Fact]
    public void Resolve_throws_when_required_current_movement_missing()
    {
        var bindings = new Dictionary<string, StepInputBinding>
        {
            ["endpointId"] = new StepInputBinding
            {
                SourceType = BindingSourceType.CURRENT_MOVEMENT,
                SourceReference = "source.endpointId"
            }
        };

        Assert.Throws<DomainValidationException>(() =>
            _resolver.Resolve(
                StepType.CHECK,
                "ENDPOINT_AVAILABLE",
                bindings,
                new Dictionary<string, JsonElement>(),
                new CurrentMovementContext(),
                new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>()));
    }

    [Fact]
    public void Resolve_current_movement_detail_and_job_container_ids()
    {
        var detailId = Guid.NewGuid();
        var jobContainerId = Guid.NewGuid();
        var bindings = new Dictionary<string, StepInputBinding>
        {
            ["containerId"] = new StepInputBinding
            {
                SourceType = BindingSourceType.CURRENT_MOVEMENT,
                SourceReference = "jobContainerId"
            }
        };

        // Use INVENTORY_AVAILABLE which requires containerId (UUID) — jobContainerId is UUID
        var resolved = _resolver.Resolve(
            StepType.CHECK,
            "INVENTORY_AVAILABLE",
            bindings,
            new Dictionary<string, JsonElement>(),
            new CurrentMovementContext
            {
                TransportRequestDetailId = detailId,
                JobContainerId = jobContainerId
            },
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());

        Assert.Equal(jobContainerId, resolved["containerId"].GetGuid());

        var ctx = new CurrentMovementContext { TransportRequestDetailId = detailId };
        Assert.True(ctx.TryGet("transportRequestDetailId", out var raw));
        Assert.Equal(detailId, raw);
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
        model.Variables.Add(new WorkflowVariableDefinition
        {
            Key = "notes",
            Name = "Notes",
            DataType = WorkflowDataType.STRING,
            Source = WorkflowVariableSource.STAFF_INPUT,
            IsRequired = true,
            SequenceNo = 99
        });

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

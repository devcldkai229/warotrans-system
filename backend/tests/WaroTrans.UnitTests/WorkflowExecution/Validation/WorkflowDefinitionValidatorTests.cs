using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.UnitTests.WorkflowExecution.Fixtures;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Registry;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.UnitTests.WorkflowExecution.Validation;

public class WorkflowDefinitionValidatorTests
{
    [Fact]
    public void Publish_valid_inbound_putaway_passes()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();
        var result = WorkflowDefinitionValidator.ValidateForPublish(model);
        Assert.True(result.IsValid, string.Join("; ", result.Errors.Select(e => $"{e.Path}: {e.Message}")));
    }

    [Fact]
    public void Publish_valid_internal_relocation_passes()
    {
        var model = InternalRelocationWorkflowFactory.CreateValid();
        var result = WorkflowDefinitionValidator.ValidateForPublish(model);
        Assert.True(result.IsValid, string.Join("; ", result.Errors.Select(e => $"{e.Path}: {e.Message}")));

        Assert.DoesNotContain(model.Variables, v => v.Key is "containerId" or "sourceEndpointId" or "destinationEndpointId");
        Assert.All(
            model.Tasks.SelectMany(t => t.Steps)
                .Where(s => s.StepKey is "CHECK_SOURCE_ENDPOINT" or "MOVE_PICKUP" or "PICKUP_CONFIRM"
                    or "CHECK_DEST_ENDPOINT" or "MOVE_DROPOFF" or "DROPOFF_CONFIRM")
                .SelectMany(s => s.InputBindings.Values)
                .Where(b => b.SourceReference is "containerId" or "source.endpointId" or "destination.endpointId"),
            b => Assert.Equal(BindingSourceType.CURRENT_MOVEMENT, b.SourceType));
    }

    [Fact]
    public void Publish_fails_on_unknown_current_movement_path()
    {
        var model = InternalRelocationWorkflowFactory.CreateValid();
        var check = model.Tasks[0].Steps.First(s => s.StepKey == "CHECK_SOURCE_ENDPOINT");
        check.InputBindings["endpointId"] = new StepInputBinding
        {
            SourceType = BindingSourceType.CURRENT_MOVEMENT,
            SourceReference = "sourceEndpointId"
        };

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Message.Contains("Unknown CURRENT_MOVEMENT", StringComparison.Ordinal));
    }

    [Fact]
    public void Publish_fails_when_required_binding_missing()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();
        var move = model.Tasks[0].Steps.First(s => s.StepKey == "MOVE_PICKUP");
        move.InputBindings.Remove("targetEndpointId");

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Path.Contains("targetEndpointId", StringComparison.Ordinal));
    }

    [Fact]
    public void Publish_fails_when_admin_input_missing_configured_value()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();
        model.Variables.First(v => v.Key == "minBatteryPercent").ConfiguredValue = null;

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Path.Contains("configuredValue", StringComparison.Ordinal));
    }

    [Fact]
    public void Publish_fails_when_step_output_references_later_step()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();
        var checkReady = model.Tasks[0].Steps.First(s => s.StepKey == "CHECK_READY");
        checkReady.InputBindings["robotId"] = new StepInputBinding
        {
            SourceType = BindingSourceType.STEP_OUTPUT,
            SourceReference = "PICKUP_CONFIRM",
            OutputKey = "confirmedBy"
        };

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Message.Contains("earlier step", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Publish_fails_on_incompatible_variable_type()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();
        model.Variables.First(v => v.Key == "assignedRobotId").DataType = WorkflowDataType.INTEGER;

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Message.Contains("incompatible", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Publish_fails_when_optional_only_current_movement_binds_required_input()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();
        var move = model.Tasks[0].Steps.First(s => s.StepKey == "MOVE_PICKUP");
        move.InputBindings["targetEndpointId"] = new StepInputBinding
        {
            SourceType = BindingSourceType.CURRENT_MOVEMENT,
            SourceReference = "source.storageLocationId"
        };

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e =>
            e.Message.Contains("optional-only", StringComparison.OrdinalIgnoreCase)
            || e.Message.Contains("cannot bind to required", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Draft_allows_incomplete_bindings()
    {
        var model = new WorkflowDefinitionModel
        {
            Code = "DRAFT_WIP",
            Name = "WIP",
            Variables = [],
            Tasks =
            [
                new WorkflowTaskModel
                {
                    TaskKey = "T1",
                    Name = "T1",
                    SequenceNo = 1,
                    Steps =
                    [
                        new WorkflowStepModel
                        {
                            StepKey = "S1",
                            Name = "S1",
                            StepType = StepType.MOVE,
                            SequenceNo = 1,
                            OperationCode = "",
                            InputBindings = new Dictionary<string, StepInputBinding>()
                        }
                    ]
                }
            ]
        };

        var result = WorkflowDefinitionValidator.ValidateDraft(model);
        Assert.True(result.IsValid, string.Join("; ", result.Errors.Select(e => $"{e.Path}: {e.Message}")));
    }

    [Fact]
    public void Publish_fails_on_unknown_system_variable_key()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();
        model.Variables.Add(new WorkflowVariableDefinition
        {
            Key = "madeUpSystemVar",
            Name = "Made up",
            DataType = WorkflowDataType.UUID,
            Source = WorkflowVariableSource.SYSTEM_VALUE,
            IsRequired = true,
            SequenceNo = 99
        });

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Message.Contains("Unknown SYSTEM_VALUE", StringComparison.Ordinal));
    }

    [Fact]
    public void Publish_accepts_valid_constant_purpose()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();
        var move = model.Tasks[0].Steps.First(s => s.StepKey == "MOVE_PICKUP");
        move.InputBindings["purpose"] = new StepInputBinding
        {
            SourceType = BindingSourceType.CONSTANT,
            ConstantValue = JsonSerializer.SerializeToElement("PICKUP")
        };

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);
        Assert.True(result.IsValid);
    }

    [Fact]
    public void Request_input_schema_builder_lists_movement_not_admin_system()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();
        var schema = RequestInputSchemaBuilder.Build(model);

        Assert.Empty(schema.WorkflowInputs);
        Assert.Contains(schema.MovementInputs, f => f.Key == "containerId" && f.Required);
        Assert.Contains(schema.MovementInputs, f => f.Key == "source.endpointId" && f.Required);
        Assert.Contains(schema.MovementInputs, f => f.Key == "destination.endpointId" && f.Required);
        Assert.DoesNotContain(schema.MovementInputs, f => f.Key == "minBatteryPercent");
        Assert.DoesNotContain(schema.WorkflowInputs, f => f.Key == "assignedRobotId");
    }

    [Fact]
    public void Request_input_schema_builder_for_internal_relocation()
    {
        var model = InternalRelocationWorkflowFactory.CreateValid();
        var schema = RequestInputSchemaBuilder.Build(model);

        Assert.Empty(schema.WorkflowInputs);
        Assert.Equal(3, schema.MovementInputs.Count);
        Assert.Contains(schema.MovementInputs, f =>
            f.Key == "containerId"
            && f.Required
            && f.Label == "Container"
            && f.Description == "Container selected for this transport movement.");
        Assert.Contains(schema.MovementInputs, f => f.Key == "source.endpointId" && f.Required && f.Label == "Source endpoint");
        Assert.Contains(schema.MovementInputs, f => f.Key == "destination.endpointId" && f.Required && f.Label == "Destination endpoint");
        Assert.All(schema.MovementInputs, f =>
        {
            Assert.DoesNotContain("JobContainer", f.Description ?? "", StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("JobContainer", f.Label, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Active JobContainer", f.Description ?? "", StringComparison.OrdinalIgnoreCase);
        });
        Assert.Contains(
            CurrentMovementCatalog.All,
            f => f.Path == "containerId"
                 && f.Description.Contains("TransportRequestDetail.ContainerId", StringComparison.Ordinal));
        Assert.DoesNotContain(schema.MovementInputs, f => f.Key == "minBatteryPercent");
        Assert.DoesNotContain(schema.MovementInputs, f => f.Key == "assignedRobotId");
        Assert.DoesNotContain(schema.MovementInputs, f => f.Key == "transportRequestId");
        Assert.DoesNotContain(schema.MovementInputs, f => f.Key == "jobId");
    }

    [Fact]
    public void Publish_rejects_job_scope_step_with_current_movement()
    {
        var model = InternalRelocationWorkflowFactory.CreateValid();
        var checkReady = model.Tasks[0].Steps.First(s => s.StepKey == "CHECK_READY");
        checkReady.InputBindings["robotId"] = new StepInputBinding
        {
            SourceType = BindingSourceType.CURRENT_MOVEMENT,
            SourceReference = "containerId"
        };

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Message.Contains("ONCE_PER_JOB", StringComparison.Ordinal));
    }

    [Fact]
    public void Publish_rejects_pickup_stop_step_bound_to_destination()
    {
        var model = InternalRelocationWorkflowFactory.CreateValid();
        var move = model.Tasks[0].Steps.First(s => s.StepKey == "MOVE_PICKUP");
        move.InputBindings["targetEndpointId"] = new StepInputBinding
        {
            SourceType = BindingSourceType.CURRENT_MOVEMENT,
            SourceReference = "destination.endpointId"
        };

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e =>
            e.Message.Contains("destination.endpointId", StringComparison.Ordinal)
            && e.Message.Contains("ONCE_PER_STOP", StringComparison.Ordinal));
    }

    [Fact]
    public void Publish_rejects_mixed_pickup_dropoff_affinity_task()
    {
        var model = InternalRelocationWorkflowFactory.CreateValid();
        // Inject DROPOFF into the PICKUP task so affinity cannot be resolved.
        model.Tasks[0].Steps.Add(new WorkflowStepModel
        {
            StepKey = "MOVE_DROPOFF_MIXED",
            Name = "Bad dropoff in pickup task",
            StepType = StepType.MOVE,
            OperationCode = "DROPOFF",
            SequenceNo = 99,
            InputBindings = new Dictionary<string, StepInputBinding>
            {
                ["robotId"] = new() { SourceType = BindingSourceType.WORKFLOW_VAR, SourceReference = "assignedRobotId" },
                ["targetEndpointId"] = new() { SourceType = BindingSourceType.CURRENT_MOVEMENT, SourceReference = "destination.endpointId" },
                ["purpose"] = new() { SourceType = BindingSourceType.CONSTANT, ConstantValue = JsonSerializer.SerializeToElement("DROPOFF") }
            }
        });

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Message.Contains("resolvable PICKUP/DROPOFF", StringComparison.Ordinal));
    }

    [Fact]
    public void Request_input_schema_builder_includes_staff_input_variables()
    {
        var model = InboundPutawayWorkflowFactory.CreateValid();
        model.Variables.Add(new WorkflowVariableDefinition
        {
            Key = "priorityNote",
            Name = "Priority note",
            DataType = WorkflowDataType.STRING,
            Source = WorkflowVariableSource.STAFF_INPUT,
            IsRequired = false,
            SequenceNo = 10,
            Description = "Optional staff note"
        });

        var schema = RequestInputSchemaBuilder.Build(model);

        var staff = Assert.Single(schema.WorkflowInputs);
        Assert.Equal("priorityNote", staff.Key);
        Assert.False(staff.Required);
    }
}

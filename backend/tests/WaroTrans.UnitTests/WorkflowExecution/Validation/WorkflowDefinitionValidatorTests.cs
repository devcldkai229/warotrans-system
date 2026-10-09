using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.UnitTests.WorkflowExecution.Fixtures;
using WaroTrans.WorkflowExecution.Enums;
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
        model.Variables.First(v => v.Key == "containerId").DataType = WorkflowDataType.INTEGER;

        var result = WorkflowDefinitionValidator.ValidateForPublish(model);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Message.Contains("incompatible", StringComparison.OrdinalIgnoreCase));
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
}

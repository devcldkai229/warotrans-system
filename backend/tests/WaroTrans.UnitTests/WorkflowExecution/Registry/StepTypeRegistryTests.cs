using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Registry;

namespace WaroTrans.UnitTests.WorkflowExecution.Registry;

public class StepTypeRegistryTests
{
    [Fact]
    public void All_contains_exactly_four_step_types()
    {
        Assert.Equal(4, StepTypeRegistry.All.Count);
        Assert.Contains(StepTypeRegistry.All, x => x.StepType == StepType.CHECK);
        Assert.Contains(StepTypeRegistry.All, x => x.StepType == StepType.MOVE);
        Assert.Contains(StepTypeRegistry.All, x => x.StepType == StepType.HUMAN_INTERACTION);
        Assert.Contains(StepTypeRegistry.All, x => x.StepType == StepType.WAIT);
    }

    [Fact]
    public void Check_has_all_condition_codes()
    {
        var check = StepTypeRegistry.Get(StepType.CHECK);
        foreach (var code in Enum.GetNames<CheckConditionCode>())
        {
            Assert.Contains(check.Operations, o => o.Code == code);
        }
    }

    [Fact]
    public void Move_has_all_purposes_with_required_inputs()
    {
        var move = StepTypeRegistry.Get(StepType.MOVE);
        foreach (var purpose in Enum.GetNames<MovePurpose>())
        {
            var op = Assert.Single(move.Operations, o => o.Code == purpose);
            Assert.Contains(op.Inputs, i => i.Key == "robotId" && i.Required);
            Assert.Contains(op.Inputs, i => i.Key == "targetEndpointId" && i.Required);
            Assert.Contains(op.Inputs, i => i.Key == "purpose" && i.Required);
        }
    }

    [Fact]
    public void Wait_modes_match_rules_DURATION_EVENT_ROBOT_STATE()
    {
        var wait = StepTypeRegistry.Get(StepType.WAIT);
        Assert.Equal(3, wait.Operations.Count);
        Assert.Contains(wait.Operations, o => o.Code == "DURATION");
        Assert.Contains(wait.Operations, o => o.Code == "EVENT");
        Assert.Contains(wait.Operations, o => o.Code == "ROBOT_STATE");
    }

    [Fact]
    public void System_and_movement_catalogs_are_non_empty()
    {
        Assert.NotEmpty(SystemVariableCatalog.All);
        Assert.NotEmpty(CurrentMovementCatalog.All);
        Assert.True(SystemVariableCatalog.TryGet("assignedRobotId", out _));
        Assert.True(CurrentMovementCatalog.TryGet("containerId", out _));
    }
}

namespace WaroTrans.BuildingBlocks.Enums;

public enum WorkflowVariableSource
{
    ADMIN_INPUT,
    STAFF_INPUT,
    SYSTEM_VALUE
}

public enum BindingSourceType
{
    WORKFLOW_VAR,
    CURRENT_MOVEMENT,
    STEP_OUTPUT,
    CONSTANT
}

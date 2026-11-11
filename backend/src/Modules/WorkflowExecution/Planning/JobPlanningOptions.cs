namespace WaroTrans.WorkflowExecution.Planning;

public sealed class JobPlanningOptions
{
    public const string SectionName = "JobPlanning";

    /// <summary>
    /// How many Containers one Job may carry. Null means no limit. One number for all robots until each robot has its
    /// own capacity (FL-03).
    /// </summary>
    public int? MaxContainersPerJob { get; set; }
}

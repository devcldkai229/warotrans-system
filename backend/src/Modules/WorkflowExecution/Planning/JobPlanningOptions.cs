namespace WaroTrans.WorkflowExecution.Planning;

public sealed class JobPlanningOptions
{
    public const string SectionName = "JobPlanning";

    /// <summary>
    /// The most Containers any robot carries at once, whatever its own capacity or the configured limit says. A robot
    /// does not count what is on it: the system enforces this when planning trips, dispatching and confirming pickups.
    /// </summary>
    public const int HardMaxContainersPerRobot = WaroTrans.BuildingBlocks.RobotLoad.MaxContainers;

    /// <summary>
    /// How many Containers one Job (one trip) may carry, at most <see cref="HardMaxContainersPerRobot"/>. Null means
    /// the hard cap. Robots with a smaller own capacity (FL-03) lower it further.
    /// </summary>
    public int? MaxContainersPerJob { get; set; }
}

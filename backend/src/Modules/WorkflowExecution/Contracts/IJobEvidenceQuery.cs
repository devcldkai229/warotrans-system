namespace WaroTrans.WorkflowExecution.Contracts;

/// <summary>
/// Read-only facts about trips for the Evidence bridge: which request a Job serves, its containers and the robots that
/// ran it. Values are as stored (status strings are never mapped).
/// </summary>
public interface IJobEvidenceQuery
{
    Task<JobEvidenceContext?> GetJobAsync(Guid jobId, CancellationToken cancellationToken = default);

    /// <summary>The Job a step belongs to.</summary>
    Task<Guid?> GetJobIdOfStepAsync(Guid jobStepId, CancellationToken cancellationToken = default);

    /// <summary>What a step is (type, name, place in the trip, target endpoint), for the replay's step lane. Default: unknown.</summary>
    Task<JobStepEvidenceView?> GetStepAsync(Guid jobStepId, CancellationToken cancellationToken = default) =>
        Task.FromResult<JobStepEvidenceView?>(null);

    /// <summary>Every trip (Job) of a transport request, with all its robot assignments.</summary>
    Task<IReadOnlyList<JobEvidenceContext>> GetJobsOfRequestAsync(Guid transportRequestId, CancellationToken cancellationToken = default);
}

/// <param name="TransportRequestId">Null for a Job that serves no request (robot care).</param>
public sealed record JobEvidenceContext(
    Guid JobId,
    string JobNo,
    string Status,
    Guid MapVersionId,
    Guid? TransportRequestId,
    IReadOnlyList<Guid> ContainerIds,
    IReadOnlyList<JobRobotAssignmentView> Assignments);

/// <param name="Position">1-based place of the step in the whole trip (tasks in order, then steps in order).</param>
/// <param name="StepCount">Number of steps of the trip.</param>
public sealed record JobStepEvidenceView(
    Guid JobStepId,
    string StepType,
    string StepName,
    string TaskName,
    int Position,
    int StepCount,
    Guid? TargetEndpointId);

public sealed record JobRobotAssignmentView(
    Guid AssignmentId,
    Guid RobotId,
    string StartReason,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    string? EndReason);

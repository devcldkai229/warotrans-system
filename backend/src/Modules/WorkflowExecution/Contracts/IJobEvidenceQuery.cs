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

public sealed record JobRobotAssignmentView(
    Guid AssignmentId,
    Guid RobotId,
    string StartReason,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    string? EndReason);

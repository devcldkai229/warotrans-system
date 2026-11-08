using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Features.Shared;

/// <summary>
/// BOTH-04: which actions a TransportRequest allows in its current state. The Queue / Cancel / Reject endpoints
/// guard with <see cref="StateReason"/> and the read DTOs expose <see cref="Evaluate"/>, so they cannot disagree.
/// </summary>
public static class TransportRequestActionPolicy
{
    public const string Queue = "QUEUE";
    public const string Cancel = "CANCEL";
    public const string Reject = "REJECT";

    public static readonly IReadOnlyList<string> All = [Queue, Cancel, Reject];

    /// <summary>Null when the state allows the action, otherwise the error code the endpoint answers with.</summary>
    public static string? StateReason(string action, TransportRequest request, IReadOnlyList<RequestJobState> jobs) => action switch
    {
        Queue => request.Status == TransportRequestStatus.SUBMITTED ? null : "transport_request_not_queueable",
        Cancel => request.Status == TransportRequestStatus.CANCELLING ? "transport_request_cancelling"
            : request.IsClosed ? "transport_request_closed"
            : null,
        // Rejecting is refusing the request, not stopping work: once a Job ran, cancel is the only way out.
        Reject => request.Status == TransportRequestStatus.SUBMITTED ? null
            : request.Status == TransportRequestStatus.QUEUED && jobs.All(j => j.NotStarted) ? null
            : request.Status is TransportRequestStatus.QUEUED or TransportRequestStatus.IN_PROGRESS ? "transport_request_already_running"
            : "transport_request_not_rejectable",
        _ => "unknown_action"
    };

    public static string PermissionOf(string action) => action switch
    {
        Cancel => Permissions.TransportCancel,
        Reject => Permissions.TransportReject,
        _ => Permissions.TransportCreate
    };

    public static IReadOnlyList<ActionAvailability> Evaluate(
        TransportRequest request,
        IReadOnlyList<RequestJobState> jobs,
        Func<string, bool> can) =>
        All.Select(action => ActionAvailability.Of(action, StateReason(action, request, jobs), can(PermissionOf(action)))).ToList();
}

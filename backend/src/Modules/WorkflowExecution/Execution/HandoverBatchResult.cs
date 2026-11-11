namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>APP-OPS-02: what happened to one Container of a Confirm All.</summary>
public sealed record HandoverBatchResult(Guid ContainerId, Guid? JobStepId, string Outcome, string? Code);

public static class HandoverBatchOutcomes
{
    public const string Confirmed = "confirmed";
    public const string AlreadyConfirmed = "already_confirmed";
    public const string Mismatch = "mismatch";
    public const string NotReached = "not_reached";
    public const string Refused = "refused";
}

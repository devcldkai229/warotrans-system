namespace WaroTrans.Operations.Enums;

/// <summary>OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED → CLOSED (see <c>IssueLifecycle</c>).</summary>
public enum IssueStatus
{
    OPEN,
    IN_PROGRESS,
    RESOLVED,
    CLOSED,
    ACKNOWLEDGED
}

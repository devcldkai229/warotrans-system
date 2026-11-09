namespace WaroTrans.BuildingBlocks.Abstractions;

/// <summary>
/// One action worth tracing later: who did what to which entity (SY-05). Actor, IP, user agent and correlation id
/// are filled in by the trail from the current request; callers only describe the action.
/// </summary>
/// <param name="Action">Machine name, <c>resource.verb</c>: <c>account.role_changed</c>, <c>robot.teleop_lease_granted</c>.</param>
/// <param name="EntityType">What was acted on: <c>ACCOUNT</c>, <c>ROBOT</c>, <c>JOB</c>, <c>REQUEST</c>, <c>MAP</c> …</param>
/// <param name="Before">State before the change. Never pass secrets; keys that look like one are dropped anyway.</param>
/// <param name="After">State after the change.</param>
/// <param name="Reason">Why, when the caller was asked for a reason (cancel, override, takeover).</param>
public sealed record AuditEntry(
    string Action,
    string EntityType,
    Guid? EntityId,
    IReadOnlyDictionary<string, object?>? Before = null,
    IReadOnlyDictionary<string, object?>? After = null,
    string? Reason = null,
    IReadOnlyDictionary<string, object?>? Context = null);

/// <summary>Implemented by Operations (Mongo <c>audit_logs</c>).</summary>
public interface IAuditTrail
{
    /// <summary>
    /// Records the entry. Never throws: a trail that cannot be written must not undo or fail the action it describes,
    /// so failures are logged instead.
    /// </summary>
    Task RecordAsync(AuditEntry entry, CancellationToken cancellationToken = default);
}

/// <summary>Removes values that must never be stored in an audit log (passwords, tokens, hashes, secrets).</summary>
public static class AuditRedaction
{
    private static readonly string[] SensitiveFragments = ["password", "token", "hash", "secret", "credential"];

    public static bool IsSensitiveKey(string key) =>
        SensitiveFragments.Any(fragment => key.Contains(fragment, StringComparison.OrdinalIgnoreCase));

    public static Dictionary<string, object?>? Redact(IReadOnlyDictionary<string, object?>? values) =>
        values?.Where(pair => !IsSensitiveKey(pair.Key)).ToDictionary(pair => pair.Key, pair => pair.Value);
}

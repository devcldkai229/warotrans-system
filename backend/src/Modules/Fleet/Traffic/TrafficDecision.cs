namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// One traffic decision worth keeping as evidence (a grant, a refusal, a quarantine, a deadlock retreat), in the order
/// the coordinator took it. <see cref="Seq"/> only grows, so a reader asks for "everything after N" and never misses
/// or repeats one. Renewals and extensions of a live grant are not decisions (they happen every second).
/// </summary>
/// <param name="Kind">plan-granted, plan-rejected, revoked, safe-stop, quarantined, queue-full, released, recovery,
/// route-complete, coordinator, deadlock-retreat, goal-wait.</param>
/// <param name="Code">The coordinator's own reason code (e.g. <c>deadlock-reject-semantic</c>).</param>
/// <param name="Severity">INFO, WARNING or ERROR, as an operator would read it.</param>
public sealed record TrafficDecision(
    long Seq,
    DateTimeOffset At,
    Guid? RobotId,
    string Kind,
    string Code,
    string Severity,
    string Detail);

/// <summary>Maps the coordinator's log lines (<c>code:robotId:detail</c>) onto decisions; everything else is noise.</summary>
public static class TrafficDecisionClassifier
{
    private static readonly (string Prefix, string Kind, string Severity)[] Rules =
    [
        ("grant-semantic", "plan-granted", "INFO"),
        ("grant", "plan-granted", "INFO"),
        ("semantic-reject-quarantined", "plan-rejected", "WARNING"),
        ("semantic-reject-keepout", "plan-rejected", "WARNING"),
        ("semantic-reject-fingerprint", "plan-rejected", "ERROR"),
        ("deadlock-reject-semantic", "plan-rejected", "WARNING"),
        ("deadlock-reject-extend", "plan-rejected", "WARNING"),
        ("deadlock-reject", "plan-rejected", "WARNING"),
        ("revoke-replan-wait", "revoked", "INFO"),
        ("revoke-keep-occ", "revoked", "WARNING"),
        ("safe-stop", "safe-stop", "WARNING"),
        ("quarantine", "quarantined", "ERROR"),
        ("queue-full", "queue-full", "WARNING"),
        ("release-stale-holds", "released", "WARNING"),
        ("release-unentered", "released", "INFO"),
        ("op-release", "released", "WARNING"),
        ("route-complete", "route-complete", "INFO"),
        ("recover-loc", "recovery", "WARNING"),
        ("mark-online-unverified", "recovery", "WARNING"),
        ("recover-online", "recovery", "INFO"),
        ("seed", "recovery", "INFO"),
        ("coordinator-closed", "coordinator", "WARNING"),
        ("coordinator-open", "coordinator", "INFO"),
        ("bind-refused", "coordinator", "ERROR"),
        ("deadlock-retreat", "deadlock-retreat", "WARNING"),
        ("goal-wait", "goal-wait", "INFO"),
        ("lab-phantom-hold", "lab", "WARNING"),
        ("lab-phantom-release", "lab", "INFO"),
    ];

    public static bool TryClassify(string message, out (string Code, string Kind, string Severity, Guid? RobotId, string Detail) decision)
    {
        decision = default;
        var colon = message.IndexOf(':');
        var code = colon < 0 ? message : message[..colon];
        var rule = Rules.FirstOrDefault(r => string.Equals(r.Prefix, code, StringComparison.Ordinal));
        if (rule.Prefix is null)
        {
            return false;
        }

        var rest = colon < 0 ? string.Empty : message[(colon + 1)..];
        Guid? robot = null;
        var next = rest.IndexOf(':');
        var first = next < 0 ? rest : rest[..next];
        if (Guid.TryParse(first, out var id))
        {
            robot = id;
            rest = next < 0 ? string.Empty : rest[(next + 1)..];
        }

        decision = (code, rule.Kind, rule.Severity, robot, rest);
        return true;
    }
}

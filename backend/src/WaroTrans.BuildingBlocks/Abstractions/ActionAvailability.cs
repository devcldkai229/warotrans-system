namespace WaroTrans.BuildingBlocks.Abstractions;

/// <summary>
/// BOTH-04: one operation a client may offer on a resource, decided by the server. <see cref="Reason"/> is a stable
/// code when the action is not allowed (wrong state, missing permission …) so Web and App show the same thing.
/// The endpoint re-checks with the same rule; a client that ignores this still gets the same refusal.
/// </summary>
public sealed record ActionAvailability(string Action, bool Allowed, string? Reason = null)
{
    public const string Forbidden = "forbidden";

    public static ActionAvailability Allow(string action) => new(action, true);

    public static ActionAvailability Deny(string action, string reason) => new(action, false, reason);

    /// <summary>The state rule first; a state that allows the action still needs the permission.</summary>
    public static ActionAvailability Of(string action, string? stateReason, bool permitted) =>
        stateReason is not null ? Deny(action, stateReason)
        : !permitted ? Deny(action, Forbidden)
        : Allow(action);
}

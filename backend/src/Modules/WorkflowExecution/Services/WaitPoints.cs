using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>
/// Wait point = queue point = recovery point: the one rule for every place a robot may stand aside in. A robot goes to
/// one to make way while idle, to back off from a wait-for cycle, to wait while its goal is taken, when every parking
/// place is full, and with cargo after a cancellation. An enabled, non-charger endpoint is one when its code starts with
/// <c>EP-QUEUE</c>, <c>EP-WAIT</c> or <c>EP-RECOVERY</c>, its name says "wait", "queue" or "recovery", or its code is
/// listed in configuration (<c>FleetIdle:FallbackEndpointCodes</c>, <c>Traffic:DeadlockRetreatEndpointCodes</c>).
/// Parking places (PARK) are not wait points, but every caller that moves a robot out of the way accepts both.
/// </summary>
public static class WaitPoints
{
    public static bool Is(EndpointPoseWithType e, IEnumerable<string>? configuredCodes = null)
    {
        if (!e.IsEnabled || e.EndpointType == EndpointType.CHARGER)
        {
            return false;
        }

        if (configuredCodes is not null && configuredCodes.Contains(e.Code, StringComparer.OrdinalIgnoreCase))
        {
            return true;
        }

        var code = e.Code.ToUpperInvariant();
        if (code.StartsWith("EP-QUEUE", StringComparison.Ordinal) || code.StartsWith("EP-WAIT", StringComparison.Ordinal)
            || code.StartsWith("EP-RECOVERY", StringComparison.Ordinal))
        {
            return true;
        }

        var name = e.Name ?? string.Empty;
        return name.Contains("wait", StringComparison.OrdinalIgnoreCase) || name.Contains("queue", StringComparison.OrdinalIgnoreCase)
               || name.Contains("recovery", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>A place a robot may be sent to get out of the way: a parking place or a wait point.</summary>
    public static bool IsStandAside(EndpointPoseWithType e, IEnumerable<string>? configuredCodes = null) =>
        e.IsEnabled && (e.EndpointType == EndpointType.PARK || Is(e, configuredCodes));

    /// <summary>The configured wait point codes of both settings, comma separated lists merged.</summary>
    public static IReadOnlyList<string> ConfiguredCodes(string? fleetIdleFallbackCodes, string? deadlockRetreatCodes) =>
        $"{fleetIdleFallbackCodes},{deadlockRetreatCodes}"
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
}

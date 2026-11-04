namespace WaroTrans.Navigation.RouteGraph;

/// <summary>
/// Optional occupancy/footprint context for Endpoint access and JUNCTION transitions at build time.
/// When null, the builder only checks KEEP_OUT / MaxEndpointAccessDistance (occupancy strip still runs at compile).
/// </summary>
public sealed class RouteGraphAccessContext
{
    public required double RequiredHalfWidthMeters { get; init; }
    public required double GridStepMeters { get; init; }
    public required Func<double, double, double> ClearanceAt { get; init; }

    /// <summary>Rejected / diagnostic access chords for debug SVG (world metres).</summary>
    public List<RejectedAccessPath> RejectedPaths { get; } = [];

    /// <summary>Rejected portal↔portal (or portal↔station) transitions inside a JUNCTION.</summary>
    public List<RejectedJunctionTransition> RejectedJunctionTransitions { get; } = [];
}

public sealed record RejectedAccessPath(
    string EndpointCode,
    double FootX,
    double FootY,
    double GoalX,
    double GoalY,
    string Reason);

public sealed record RejectedJunctionTransition(
    string JunctionCode,
    double FromX,
    double FromY,
    double ToX,
    double ToY,
    string Reason);

using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

public enum TrafficCoordinatorMode
{
    /// <summary>V1 whole-route grants dispatch motion; segmented coordinator observes only.</summary>
    Shadow = 0,
    /// <summary>Segmented coordinator is the sole motion authority (RouteGraph edge grants).</summary>
    Active = 1,
    /// <summary>Stage-3: Nav2 path proposal + spatial/semantic zone/cell grants (no RouteGraph A*).</summary>
    Semantic = 2
}

/// <summary>Configuration under <c>Traffic</c>.</summary>
public sealed class TrafficOptions
{
    public const string SectionName = "Traffic";

    public TrafficCoordinatorMode Mode { get; set; } = TrafficCoordinatorMode.Shadow;

    public TrafficFootprintOptions Footprint { get; set; } = new();

    /// <summary>Endpoint code → bay kind. CHARGER/PARK may also come from EndpointType.</summary>
    public Dictionary<string, string> Stations { get; set; } = new(StringComparer.Ordinal);

    public double AgingRate { get; set; } = 0.1;

    public double HysteresisRatio { get; set; } = 0.15;

    public int InboxCapacity { get; set; } = 1024;

    public int EventLogCapacity { get; set; } = 2048;

    public int MaxQueueLengthPerResource { get; set; } = 64;

    public int InboxOfferTimeoutMs { get; set; } = 50;

    /// <summary>Seconds a HUMAN_INTERACTION may wait before ops escalation (hold is kept).</summary>
    public int HumanConfirmTimeoutSec { get; set; } = 300;

    /// <summary>MQTT authority expiresAt horizon for grant/extend/renew (Active Mode).</summary>
    public int AuthorityTtlSec { get; set; } = 30;

    /// <summary>
    /// How often Active Mode re-publishes RENEW_AUTHORITY while a segment is granted.
    /// Must stay below robot <c>authority_loss_timeout_sec</c> (default 3s).
    /// </summary>
    public double AuthorityRenewIntervalSec { get; set; } = 1.5;

    /// <summary>
    /// Localization uncertainty added to the footprint turn radius before a resource counts as physically left
    /// (and around a pose when seeding occupancy). Release is fail-closed: too small releases early.
    /// </summary>
    public double LocalizationMarginMeters { get; set; } = 0.05;

    /// <summary>Telemetry older than this is not trusted to seed or reconcile occupancy.</summary>
    public double PoseMaxAgeSec { get; set; } = 5.0;

    /// <summary>
    /// Robot code → endpoint code where that robot must physically stand when it starts its first Job after this host
    /// started (where the operator placed and localized it). Robots not listed are not checked.
    /// </summary>
    public Dictionary<string, string> RobotHomeEndpoints { get; set; } = new(StringComparer.Ordinal);

    /// <summary>How far (m) a robot's localized pose may be from its home endpoint and still count as being there.</summary>
    public double RobotHomeToleranceMeters { get; set; } = 0.30;

    /// <summary>Directory with Stage-2/3 adapter artifacts (lanes/zones/manifest). Empty = unset.</summary>
    public string SemanticMapDirectory { get; set; } = "";

    /// <summary>Look-ahead horizon (m) for swept cell reservation.</summary>
    public double SemanticHorizonMeters { get; set; } = 4.0;

    /// <summary>Spatial cell size (m) for dynamic conflict resources.</summary>
    public double SemanticCellSizeMeters { get; set; } = 0.5;

    /// <summary>Sideways drift off the proposed path still covered by the reservation (the robot stops beyond it).</summary>
    public double SemanticPathToleranceMeters { get; set; } = 0.15;

    /// <summary>
    /// Grant a traffic_plan that belongs to no open backend NAVIGATE (an RViz / CLI goal). Off on real robots: only
    /// motion the backend commanded is authorized.
    /// </summary>
    public bool AllowStandaloneSemanticPlans { get; set; }

    /// <summary>
    /// 0: every path sample reserves a disc (the body at any heading plus the path tolerance). Above 0: along a straight
    /// stretch it reserves a rectangle this wide on each side instead, so robots on two lanes side by side do not share
    /// cells. Needs SemanticCellSizeMeters 0.1: cells must be finer than the gap between the two rectangles. The gate
    /// then checks the body at its real heading, so it stops a robot that drifts out of the rectangle.
    /// </summary>
    public double SemanticLaneHalfWidthMeters { get; set; }

    /// <summary>
    /// A plan that conflicts is granted up to the conflict instead of not at all, so a robot drives on and waits just
    /// before the zone or the robot in its way (the gate stops it at the edge of what it holds) rather than where it
    /// happened to be when the conflict appeared, possibly metres away. Off: all or nothing.
    /// </summary>
    public bool SemanticPrefixGrant { get; set; }

    /// <summary>
    /// Grants wait until this host holds the coordinator lease (one coordinator per map) and has announced its epoch
    /// to the robots. Off for in-process tests; on in every deployed host.
    /// </summary>
    public bool RequireCoordinatorLease { get; set; }

    /// <summary>The one Semantic policy shape both binds (bootstrap and MOVE start) use.</summary>
    public SemanticTrafficPolicy ApplySemanticOverrides(SemanticTrafficPolicy policy) => policy with
    {
        LaneHalfWidthMeters = SemanticLaneHalfWidthMeters,
        HorizonMeters = SemanticHorizonMeters,
        CellSizeMeters = SemanticCellSizeMeters,
        PathToleranceMeters = SemanticPathToleranceMeters,
        FootprintHalfLength = Math.Max(0.01, Footprint.LengthMeters / 2.0 + Footprint.PaddingMeters),
        FootprintHalfWidth = Math.Max(0.01, Footprint.WidthMeters / 2.0 + Footprint.PaddingMeters)
    };

    public IReadOnlyList<TrafficStationMeta> ResolveStationMeta()
    {
        var list = new List<TrafficStationMeta>();
        foreach (var (code, raw) in Stations.OrderBy(kv => kv.Key, StringComparer.Ordinal))
        {
            if (!Enum.TryParse<TrafficStationBayKind>(raw, ignoreCase: true, out var kind))
            {
                kind = TrafficStationBayKind.Unspecified;
            }

            list.Add(new TrafficStationMeta(code, kind));
        }

        return list;
    }
}

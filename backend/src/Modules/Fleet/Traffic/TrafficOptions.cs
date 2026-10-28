using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

public enum TrafficCoordinatorMode
{
    /// <summary>V1 whole-route grants dispatch motion; segmented coordinator observes only.</summary>
    Shadow = 0,
    /// <summary>Segmented coordinator is the sole motion authority (deferred).</summary>
    Active = 1
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

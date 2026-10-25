using System.Collections.Immutable;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic.StationPolicies;

/// <summary>Resolved in-memory hold target for a MOVE / HUMAN stop. No persistence.</summary>
public sealed record StationPolicyIntent(
    string EndpointCode,
    TrafficStationBayKind BayKind,
    string? BayResourceId,
    string? AccessCorridorResourceId,
    ImmutableArray<string> HoldResourceIds,
    StationPolicyKind PolicyKind,
    bool PreferAvoidCriticalCorridor,
    bool AllowVacateToHoldingBay);

public enum StationPolicyKind
{
    Transit,
    Inbound,
    Outbound,
    Inspection,
    Charging,
    Parking,
    RecoveryWait,
    ShelfService
}

public sealed record StationPolicyResolution(
    bool Ok,
    string? Reason,
    StationPolicyIntent? Intent);

using System.Collections.Immutable;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic.StationPolicies;

/// <summary>
/// Maps MOVE purpose string + compiled station bay kind → hold resource ids (bay:{code}).
/// Purpose values match WorkflowExecution MovePurpose names without a module dependency.
/// </summary>
public static class StationPolicyResolver
{
    public static StationPolicyResolution Resolve(
        CompiledTrafficGraph graph,
        string endpointCode,
        string? purpose)
    {
        if (string.IsNullOrWhiteSpace(endpointCode))
        {
            return new StationPolicyResolution(false, "ENDPOINT_CODE_REQUIRED", null);
        }

        var purposeKey = (purpose ?? "TRANSIT").Trim().ToUpperInvariant();
        var station = graph.Stations.FirstOrDefault(s =>
            string.Equals(s.EndpointCode, endpointCode, StringComparison.OrdinalIgnoreCase));

        var bayKind = station?.BayKind ?? TrafficStationBayKind.Unspecified;
        string? bayId = station is not null ? $"bay:{station.EndpointCode}" : null;
        if (bayId is not null && graph.Resources.All(r => r.Id != bayId))
        {
            bayId = null;
        }

        var policy = Classify(purposeKey, bayKind);
        var hold = new List<string>();
        if (bayId is not null)
        {
            hold.Add(bayId);
        }

        if (policy is StationPolicyKind.ShelfService or StationPolicyKind.Inspection)
        {
            foreach (var res in graph.Resources.Where(r =>
                         r.Kind is TrafficResourceKind.ServiceCorridor
                         && r.RelatedCodes.Contains(endpointCode, StringComparer.OrdinalIgnoreCase)))
            {
                if (!hold.Contains(res.Id, StringComparer.Ordinal))
                {
                    hold.Add(res.Id);
                }
            }
        }

        if (policy is StationPolicyKind.Transit && hold.Count == 0)
        {
            return new StationPolicyResolution(true, null, new StationPolicyIntent(
                endpointCode,
                bayKind,
                null,
                null,
                ImmutableArray<string>.Empty,
                StationPolicyKind.Transit,
                PreferAvoidCriticalCorridor: false,
                AllowVacateToHoldingBay: false));
        }

        if (hold.Count == 0 && policy is not StationPolicyKind.Transit)
        {
            return new StationPolicyResolution(true, "NO_BAY_RESOURCE", new StationPolicyIntent(
                endpointCode,
                bayKind,
                null,
                null,
                ImmutableArray<string>.Empty,
                policy,
                PreferAvoidCriticalCorridor: policy == StationPolicyKind.Inspection,
                AllowVacateToHoldingBay: policy == StationPolicyKind.Inbound));
        }

        string? accessCorridor = hold.FirstOrDefault(id =>
            graph.Resources.Any(r => r.Id == id && r.Kind == TrafficResourceKind.ServiceCorridor));

        return new StationPolicyResolution(true, null, new StationPolicyIntent(
            endpointCode,
            bayKind,
            bayId,
            accessCorridor,
            hold.ToImmutableArray(),
            policy,
            PreferAvoidCriticalCorridor: policy == StationPolicyKind.Inspection,
            AllowVacateToHoldingBay: policy == StationPolicyKind.Inbound));
    }

    /// <summary>
    /// Nearest free Holding/Recovery bay by Euclidean distance to station node.
    /// Never returns an occupied/full bay — caller must HoldServiceResource before navigate.
    /// </summary>
    public static string? FindNearestAvailableHoldingBay(
        CompiledTrafficGraph graph,
        TrafficSnapshot snapshot,
        double poseX,
        double poseY)
    {
        var occupied = snapshot.Resources
            .Where(r => r.Holders.Length >= r.Capacity)
            .Select(r => r.ResourceId)
            .ToHashSet(StringComparer.Ordinal);

        var candidates = graph.Stations
            .Where(s => s.IsRecovery || s.BayKind is TrafficStationBayKind.Holding or TrafficStationBayKind.Recovery)
            .Select(s => $"bay:{s.EndpointCode}")
            .Where(id => graph.Resources.Any(r => r.Id == id))
            .Where(id => !occupied.Contains(id))
            .ToList();

        if (candidates.Count == 0)
        {
            return null;
        }

        string? best = null;
        var bestCost = double.MaxValue;
        foreach (var bayId in candidates)
        {
            var station = graph.Stations.First(s => string.Equals($"bay:{s.EndpointCode}", bayId, StringComparison.Ordinal));
            var node = graph.Nodes.FirstOrDefault(n => n.Id == station.NodeId);
            if (node is null)
            {
                continue;
            }

            var dx = node.X - poseX;
            var dy = node.Y - poseY;
            var cost = Math.Sqrt(dx * dx + dy * dy);
            if (cost < bestCost)
            {
                bestCost = cost;
                best = bayId;
            }
        }

        return best ?? candidates[0];
    }

    private static StationPolicyKind Classify(string purpose, TrafficStationBayKind bayKind)
    {
        if (bayKind == TrafficStationBayKind.Qc)
        {
            return StationPolicyKind.Inspection;
        }

        return purpose switch
        {
            // Service bays = shelf faces. Unspecified (e.g. WAYPOINT docks on V018) follow purpose.
            "PICKUP" when bayKind is TrafficStationBayKind.Service
                => StationPolicyKind.ShelfService,
            "PICKUP" => StationPolicyKind.Inbound,
            "DROPOFF" when bayKind is TrafficStationBayKind.Service
                => StationPolicyKind.ShelfService,
            "DROPOFF" => StationPolicyKind.Outbound,
            "CHARGE" => StationPolicyKind.Charging,
            "PARK" => StationPolicyKind.Parking,
            "TRANSIT" when bayKind is TrafficStationBayKind.Holding or TrafficStationBayKind.Recovery
                => StationPolicyKind.RecoveryWait,
            _ => StationPolicyKind.Transit
        };
    }
}

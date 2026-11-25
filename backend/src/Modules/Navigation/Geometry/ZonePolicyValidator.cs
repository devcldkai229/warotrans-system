using System.Text.Json;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Geometry;

/// <summary>
/// Validates type-specific Zone.Policy JSON against ZoneType enum values.
/// Occupancy is enforced by SINGLE_OCCUPANCY zones (no Capacity column).
/// </summary>
public static class ZonePolicyValidator
{
    public const int SchemaVersion = 1;

    /// <summary>Zone-chain kinds of a SINGLE_OCCUPANCY zone (policy <c>kind</c>).</summary>
    public static readonly IReadOnlySet<string> TrafficZoneKinds =
        new HashSet<string>(["BAY", "TRANSIT", "YARD", "SLOT"], StringComparer.Ordinal);

    public static void Validate(
        ZoneType zoneType,
        double? maxSpeed,
        JsonDocument? policy,
        int policySchemaVersion)
    {
        if (policySchemaVersion != SchemaVersion)
        {
            throw new DomainValidationException(
                $"Unsupported PolicySchemaVersion '{policySchemaVersion}' (expected {SchemaVersion}).",
                "zone_policy_invalid");
        }

        if (maxSpeed is { } speed && (!double.IsFinite(speed) || speed <= 0))
        {
            throw new DomainValidationException(
                "MaxSpeed must be a finite number greater than 0 when provided (meters/second).",
                "zone_policy_invalid");
        }

        // Type-specific extras are no longer required in schema v1; keep the argument for API stability.
        _ = policy;

        switch (zoneType)
        {
            case ZoneType.SINGLE_OCCUPANCY:
                if (policy?.RootElement is not { ValueKind: JsonValueKind.Object } root)
                {
                    break;
                }

                // Optional queue point: a robot sent into the area while another robot is in it waits there first.
                if (root.TryGetProperty("queueEndpointCode", out var queue)
                    && (queue.ValueKind != JsonValueKind.String
                        || !(queue.GetString() ?? "").StartsWith("EP-", StringComparison.Ordinal)))
                {
                    throw new DomainValidationException(
                        "queueEndpointCode must be the code of an endpoint (EP-...).", "zone_policy_invalid");
                }

                // Zone-chain partition (Traffic:SemanticResourceModel = ZoneChain): what the zone is for.
                if (root.TryGetProperty("kind", out var kind)
                    && (kind.ValueKind != JsonValueKind.String || !TrafficZoneKinds.Contains(kind.GetString() ?? "")))
                {
                    throw new DomainValidationException(
                        "kind must be BAY, TRANSIT, YARD or SLOT.", "zone_policy_invalid");
                }

                // Queue points in order of preference: where a robot waits while another robot is in the zone.
                if (root.TryGetProperty("queueEndpointCodes", out var queues)
                    && (queues.ValueKind != JsonValueKind.Array
                        || queues.EnumerateArray().Any(q => q.ValueKind != JsonValueKind.String
                                                            || !(q.GetString() ?? "").StartsWith("EP-", StringComparison.Ordinal))))
                {
                    throw new DomainValidationException(
                        "queueEndpointCodes must be a list of endpoint codes (EP-...).", "zone_policy_invalid");
                }

                // Waiting poses on the lane into the zone ([x, y] or [x, y, yaw] each, map frame).
                if (root.TryGetProperty("holdPoses", out var holds)
                    && (holds.ValueKind != JsonValueKind.Array
                        || holds.EnumerateArray().Any(h => h.ValueKind != JsonValueKind.Array
                                                           || h.GetArrayLength() is < 2 or > 3
                                                           || h.EnumerateArray().Any(v => v.ValueKind != JsonValueKind.Number))))
                {
                    throw new DomainValidationException(
                        "holdPoses must be a list of [x, y] or [x, y, yaw] numbers.", "zone_policy_invalid");
                }

                break;

            case ZoneType.KEEP_OUT:
            case ZoneType.NO_STOP:
            case ZoneType.JUNCTION:
                // No extra policy required. SINGLE_OCCUPANCY is the occupancy lock itself.
                break;

            case ZoneType.SPEED:
                if (maxSpeed is null)
                {
                    throw new DomainValidationException(
                        "SPEED zones require MaxSpeed (meters/second).",
                        "zone_policy_invalid");
                }

                break;

            default:
                throw new DomainValidationException(
                    $"Unsupported ZoneType '{zoneType}'.",
                    "zone_policy_invalid");
        }
    }
}

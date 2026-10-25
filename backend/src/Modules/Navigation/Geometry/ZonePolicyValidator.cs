using System.Text.Json;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Geometry;

/// <summary>
/// Validates type-specific Zone.Policy JSON against ZoneType enum values.
/// </summary>
public static class ZonePolicyValidator
{
    public const int SchemaVersion = 1;

    public static void Validate(
        ZoneType zoneType,
        int capacity,
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

        if (capacity < 1)
        {
            throw new DomainValidationException("Capacity must be at least 1.", "zone_policy_invalid");
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
            case ZoneType.KEEP_OUT:
            case ZoneType.NO_STOP:
                // No extra policy required.
                break;

            case ZoneType.SPEED:
                if (maxSpeed is null)
                {
                    throw new DomainValidationException(
                        "SPEED zones require MaxSpeed (meters/second).",
                        "zone_policy_invalid");
                }

                break;

            case ZoneType.SINGLE_OCCUPANCY:
            case ZoneType.JUNCTION:
                if (capacity != 1)
                {
                    throw new DomainValidationException(
                        $"{zoneType} zones require Capacity = 1.",
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

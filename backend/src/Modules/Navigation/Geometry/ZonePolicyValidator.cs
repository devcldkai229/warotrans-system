using System.Text.Json;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Geometry;

/// <summary>
/// Validates type-specific Zone.Policy JSON against existing ZoneType enum values only.
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

        switch (zoneType)
        {
            case ZoneType.RESTRICTED_AREA:
                // No extra policy required.
                break;

            case ZoneType.NARROW_AREA:
                if (capacity != 1)
                {
                    throw new DomainValidationException(
                        "NARROW_AREA zones require Capacity = 1.",
                        "zone_policy_invalid");
                }

                if (maxSpeed is null)
                {
                    throw new DomainValidationException(
                        "NARROW_AREA zones require MaxSpeed (meters/second).",
                        "zone_policy_invalid");
                }

                break;

            case ZoneType.INTERSECTION:
                ValidateIntersectionPolicy(policy);
                break;

            case ZoneType.OPERATIONAL_AREA:
                ValidateOperationalPolicy(policy);
                break;

            default:
                throw new DomainValidationException(
                    $"Unsupported ZoneType '{zoneType}'.",
                    "zone_policy_invalid");
        }
    }

    private static void ValidateIntersectionPolicy(JsonDocument? policy)
    {
        if (policy is null)
        {
            return;
        }

        var root = policy.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
        {
            throw new DomainValidationException("INTERSECTION policy must be a JSON object.", "zone_policy_invalid");
        }

        if (root.TryGetProperty("preferredDirectionYaw", out var yaw))
        {
            if (yaw.ValueKind != JsonValueKind.Number || !double.IsFinite(yaw.GetDouble()))
            {
                throw new DomainValidationException(
                    "preferredDirectionYaw must be a finite number (radians).",
                    "zone_policy_invalid");
            }
        }

        if (root.TryGetProperty("headingToleranceRadians", out var tol))
        {
            var value = tol.GetDouble();
            if (tol.ValueKind != JsonValueKind.Number || !double.IsFinite(value) || value < 0)
            {
                throw new DomainValidationException(
                    "headingToleranceRadians must be a finite number >= 0.",
                    "zone_policy_invalid");
            }
        }
    }

    private static void ValidateOperationalPolicy(JsonDocument? policy)
    {
        if (policy is null)
        {
            return;
        }

        var root = policy.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
        {
            throw new DomainValidationException("OPERATIONAL_AREA policy must be a JSON object.", "zone_policy_invalid");
        }

        if (!root.TryGetProperty("costMultiplier", out var multiplier))
        {
            return;
        }

        var value = multiplier.GetDouble();
        if (multiplier.ValueKind != JsonValueKind.Number || !double.IsFinite(value) || value <= 0)
        {
            throw new DomainValidationException(
                "costMultiplier must be a finite number greater than 0.",
                "zone_policy_invalid");
        }
    }
}

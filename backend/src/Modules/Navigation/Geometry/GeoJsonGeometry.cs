using System.Text.Json;
using WaroTrans.BuildingBlocks.Exceptions;

namespace WaroTrans.Navigation.Geometry;

/// <summary>
/// Canonical persisted geometry: GeoJSON LineString / Polygon in map/world meters.
/// </summary>
public static class GeoJsonGeometry
{
    public static JsonDocument NormalizeLineString(JsonElement geometry)
    {
        var coords = ParseLineStringCoordinates(geometry);
        return JsonSerializer.SerializeToDocument(new
        {
            type = "LineString",
            coordinates = coords
        });
    }

    public static JsonDocument NormalizePolygon(JsonElement geometry)
    {
        var ring = ParsePolygonRing(geometry);
        return JsonSerializer.SerializeToDocument(new
        {
            type = "Polygon",
            coordinates = new[] { ring }
        });
    }

    public static IReadOnlyList<double[]> ParseLineStringCoordinates(JsonElement geometry)
    {
        EnsureType(geometry, "LineString");
        if (!geometry.TryGetProperty("coordinates", out var coordinates) ||
            coordinates.ValueKind != JsonValueKind.Array)
        {
            throw new DomainValidationException(
                "LineString.coordinates must be an array of [x, y] positions.",
                "geometry_invalid");
        }

        var points = new List<double[]>();
        foreach (var position in coordinates.EnumerateArray())
        {
            points.Add(ParsePosition(position));
        }

        if (points.Count < 2)
        {
            throw new DomainValidationException(
                "LineString must contain at least 2 positions.",
                "geometry_invalid");
        }

        return points;
    }

    public static IReadOnlyList<double[]> ParsePolygonRing(JsonElement geometry)
    {
        EnsureType(geometry, "Polygon");
        if (!geometry.TryGetProperty("coordinates", out var coordinates) ||
            coordinates.ValueKind != JsonValueKind.Array ||
            coordinates.GetArrayLength() < 1)
        {
            throw new DomainValidationException(
                "Polygon.coordinates must be an array of linear rings.",
                "geometry_invalid");
        }

        var ringElement = coordinates[0];
        if (ringElement.ValueKind != JsonValueKind.Array)
        {
            throw new DomainValidationException(
                "Polygon outer ring must be an array of [x, y] positions.",
                "geometry_invalid");
        }

        var ring = new List<double[]>();
        foreach (var position in ringElement.EnumerateArray())
        {
            ring.Add(ParsePosition(position));
        }

        if (ring.Count < 4)
        {
            throw new DomainValidationException(
                "Polygon ring must have at least 4 positions (3 unique vertices + closed first/last).",
                "geometry_invalid");
        }

        var first = ring[0];
        var last = ring[^1];
        if (!AlmostEqual(first[0], last[0]) || !AlmostEqual(first[1], last[1]))
        {
            throw new DomainValidationException(
                "Polygon ring must be closed (first and last positions equal).",
                "geometry_invalid");
        }

        var unique = new HashSet<(long, long)>();
        for (var i = 0; i < ring.Count - 1; i++)
        {
            unique.Add((BitConverter.DoubleToInt64Bits(ring[i][0]), BitConverter.DoubleToInt64Bits(ring[i][1])));
        }

        if (unique.Count < 3)
        {
            throw new DomainValidationException(
                "Polygon must contain at least 3 unique vertices.",
                "geometry_invalid");
        }

        return ring;
    }

    private static void EnsureType(JsonElement geometry, string expected)
    {
        if (geometry.ValueKind != JsonValueKind.Object ||
            !geometry.TryGetProperty("type", out var type) ||
            type.ValueKind != JsonValueKind.String ||
            !string.Equals(type.GetString(), expected, StringComparison.Ordinal))
        {
            throw new DomainValidationException(
                $"Geometry.type must be '{expected}'.",
                "geometry_invalid");
        }
    }

    private static double[] ParsePosition(JsonElement position)
    {
        if (position.ValueKind != JsonValueKind.Array || position.GetArrayLength() < 2)
        {
            throw new DomainValidationException(
                "Each position must be [x, y] with finite numbers.",
                "geometry_invalid");
        }

        var x = position[0].GetDouble();
        var y = position[1].GetDouble();
        if (!double.IsFinite(x) || !double.IsFinite(y))
        {
            throw new DomainValidationException(
                "Geometry coordinates must be finite numbers.",
                "geometry_invalid");
        }

        return [x, y];
    }

    private static bool AlmostEqual(double a, double b) => Math.Abs(a - b) < 1e-9;
}

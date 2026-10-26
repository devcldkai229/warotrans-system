using System.Text;
using System.Text.Json;

namespace WaroTrans.Navigation.RouteGraph;

/// <summary>
/// Writes a <see cref="RouteGraph"/> as the GeoJSON graph file read by the Nav2 Route Server
/// (nav2_route GeoJsonGraphFileLoader, same layout as /opt/ros/jazzy/share/nav2_route/graphs/sample_graph.geojson):
/// nodes are Points with properties { id, frame, metadata }, edges are 2-point MultiLineStrings with
/// properties { id, startid, endid, metadata }. Coordinates in metres, rounded to 4 decimals.
/// </summary>
public static class RouteGraphGeoJsonWriter
{
    public const string ContentType = "application/geo+json";

    public static string Write(RouteGraph graph, string? graphHash = null)
    {
        using var buffer = new MemoryStream();
        using (var json = new Utf8JsonWriter(buffer, new JsonWriterOptions { Indented = true }))
        {
            json.WriteStartObject();
            json.WriteString("type", "FeatureCollection");
            json.WriteString("name", graph.Name);
            if (!string.IsNullOrWhiteSpace(graphHash))
            {
                json.WriteStartObject("properties");
                json.WriteString("graphHash", graphHash);
                json.WriteEndObject();
            }

            json.WriteStartArray("features");

            var nodes = graph.Nodes.ToDictionary(n => n.Id);
            foreach (var node in graph.Nodes)
            {
                json.WriteStartObject();
                json.WriteString("type", "Feature");
                json.WriteStartObject("properties");
                json.WriteNumber("id", node.Id);
                json.WriteString("frame", graph.FrameId);
                json.WriteStartObject("metadata");
                if (node.EndpointCodes.Count > 0)
                {
                    json.WriteStartArray("endpoint_codes");
                    foreach (var code in node.EndpointCodes)
                    {
                        json.WriteStringValue(code);
                    }

                    json.WriteEndArray();
                }

                json.WriteEndObject();
                json.WriteEndObject();
                json.WriteStartObject("geometry");
                json.WriteString("type", "Point");
                json.WriteStartArray("coordinates");
                WriteCoordinate(json, node.X);
                WriteCoordinate(json, node.Y);
                json.WriteEndArray();
                json.WriteEndObject();
                json.WriteEndObject();
            }

            foreach (var edge in graph.Edges)
            {
                var (start, end) = (nodes[edge.StartId], nodes[edge.EndId]);
                json.WriteStartObject();
                json.WriteString("type", "Feature");
                json.WriteStartObject("properties");
                json.WriteNumber("id", edge.Id);
                json.WriteNumber("startid", edge.StartId);
                json.WriteNumber("endid", edge.EndId);
                json.WriteStartObject("metadata");
                if (edge.EdgeCodes.Count > 0)
                {
                    json.WriteString("edge_code", string.Join(",", edge.EdgeCodes));
                }

                if (edge.AbsSpeedLimit is { } speed)
                {
                    json.WritePropertyName("abs_speed_limit");
                    WriteCoordinate(json, speed);
                }

                if (edge.IsConnector)
                {
                    json.WriteBoolean("connector", true);
                }

                if (edge.ZoneCodes.Count > 0)
                {
                    json.WriteString("zone_codes", string.Join(",", edge.ZoneCodes));
                }

                if (edge.NoStop)
                {
                    json.WriteBoolean("no_stop", true);
                }

                if (edge.SingleOccupancy)
                {
                    json.WriteBoolean("single_occupancy", true);
                }

                if (edge.IsJunction)
                {
                    json.WriteBoolean("junction", true);
                }

                json.WriteEndObject();
                json.WriteEndObject();
                json.WriteStartObject("geometry");
                json.WriteString("type", "MultiLineString");
                json.WriteStartArray("coordinates");
                json.WriteStartArray();
                foreach (var point in new[] { start, end })
                {
                    json.WriteStartArray();
                    WriteCoordinate(json, point.X);
                    WriteCoordinate(json, point.Y);
                    json.WriteEndArray();
                }

                json.WriteEndArray();
                json.WriteEndArray();
                json.WriteEndObject();
                json.WriteEndObject();
            }

            json.WriteEndArray();
            json.WriteEndObject();
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    private static void WriteCoordinate(Utf8JsonWriter json, double value)
    {
        var rounded = Math.Round(value, 4, MidpointRounding.AwayFromZero);
        json.WriteNumberValue(rounded == 0 ? 0 : rounded); // no "-0"
    }
}

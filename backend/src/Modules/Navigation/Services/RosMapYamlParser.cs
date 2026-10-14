using WaroTrans.BuildingBlocks.Exceptions;
using YamlDotNet.RepresentationModel;

namespace WaroTrans.Navigation.Services;

public sealed record RosMapYamlMetadata(
    string? Image,
    double Resolution,
    double OriginX,
    double OriginY,
    double OriginYaw,
    bool Negate,
    double OccupiedThreshold,
    double FreeThreshold);

public static class RosMapYamlParser
{
    public static RosMapYamlMetadata Parse(string yamlText)
    {
        try
        {
            using var reader = new StringReader(yamlText);
            var yaml = new YamlStream();
            yaml.Load(reader);
            if (yaml.Documents.Count == 0 || yaml.Documents[0].RootNode is not YamlMappingNode root)
            {
                throw new DomainValidationException("map.yaml must be a YAML mapping.", "map_yaml_invalid");
            }

            var image = GetString(root, "image");
            var resolution = GetDouble(root, "resolution");
            if (resolution <= 0 || !double.IsFinite(resolution))
            {
                throw new DomainValidationException(
                    "map.yaml resolution must be a finite number greater than 0.",
                    "map_yaml_invalid");
            }

            var (ox, oy, oyaw) = GetOrigin(root);
            var negate = GetInt(root, "negate", 0) != 0;
            var occupied = GetDouble(root, "occupied_thresh", 0.65);
            var free = GetDouble(root, "free_thresh", 0.25);

            return new RosMapYamlMetadata(image, resolution, ox, oy, oyaw, negate, occupied, free);
        }
        catch (DomainValidationException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new DomainValidationException($"Failed to parse map.yaml: {ex.Message}", "map_yaml_invalid");
        }
    }

    private static (double X, double Y, double Yaw) GetOrigin(YamlMappingNode root)
    {
        if (!root.Children.TryGetValue(new YamlScalarNode("origin"), out var originNode) ||
            originNode is not YamlSequenceNode seq ||
            seq.Children.Count < 3)
        {
            throw new DomainValidationException(
                "map.yaml origin must be a sequence of [x, y, yaw].",
                "map_yaml_invalid");
        }

        var x = ParseDouble(seq.Children[0], "origin[0]");
        var y = ParseDouble(seq.Children[1], "origin[1]");
        var yaw = ParseDouble(seq.Children[2], "origin[2]");
        return (x, y, yaw);
    }

    private static string? GetString(YamlMappingNode root, string key)
    {
        if (!root.Children.TryGetValue(new YamlScalarNode(key), out var node))
        {
            return null;
        }

        return node.ToString();
    }

    private static double GetDouble(YamlMappingNode root, string key, double? defaultValue = null)
    {
        if (!root.Children.TryGetValue(new YamlScalarNode(key), out var node))
        {
            if (defaultValue.HasValue)
            {
                return defaultValue.Value;
            }

            throw new DomainValidationException($"map.yaml missing required field '{key}'.", "map_yaml_invalid");
        }

        return ParseDouble(node, key);
    }

    private static int GetInt(YamlMappingNode root, string key, int defaultValue)
    {
        if (!root.Children.TryGetValue(new YamlScalarNode(key), out var node))
        {
            return defaultValue;
        }

        if (!int.TryParse(node.ToString(), out var value))
        {
            throw new DomainValidationException($"map.yaml '{key}' must be an integer.", "map_yaml_invalid");
        }

        return value;
    }

    private static double ParseDouble(YamlNode node, string field)
    {
        if (!double.TryParse(node.ToString(), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var value) ||
            !double.IsFinite(value))
        {
            throw new DomainValidationException($"map.yaml '{field}' must be a finite number.", "map_yaml_invalid");
        }

        return value;
    }
}

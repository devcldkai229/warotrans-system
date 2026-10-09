namespace WaroTrans.BuildingBlocks.Mqtt;

public static class RobotMqttTopics
{
    public const string HeartbeatSuffix = "heartbeat";
    public const string TelemetrySuffix = "telemetry";

    public static string HeartbeatFilter(string topicPrefix) =>
        $"{NormalizePrefix(topicPrefix)}/robots/+/heartbeat";

    public static string TelemetryFilter(string topicPrefix) =>
        $"{NormalizePrefix(topicPrefix)}/robots/+/telemetry";

    public static string Heartbeat(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/heartbeat";

    public static string Telemetry(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/telemetry";

    public static bool TryParse(string topic, string topicPrefix, out string robotCode, out string kind)
    {
        robotCode = string.Empty;
        kind = string.Empty;

        var prefix = NormalizePrefix(topicPrefix) + "/robots/";
        if (!topic.StartsWith(prefix, StringComparison.Ordinal))
        {
            return false;
        }

        var rest = topic[prefix.Length..];
        var slash = rest.IndexOf('/');
        if (slash <= 0 || slash == rest.Length - 1)
        {
            return false;
        }

        robotCode = rest[..slash];
        kind = rest[(slash + 1)..];
        return kind is HeartbeatSuffix or TelemetrySuffix;
    }

    public static string NormalizePrefix(string topicPrefix) =>
        string.IsNullOrWhiteSpace(topicPrefix)
            ? "warotrans/v1"
            : topicPrefix.Trim().TrimEnd('/');
}

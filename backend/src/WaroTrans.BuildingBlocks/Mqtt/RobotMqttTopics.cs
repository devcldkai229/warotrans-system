namespace WaroTrans.BuildingBlocks.Mqtt;

public static class RobotMqttTopics
{
    public const string HeartbeatSuffix = "heartbeat";
    public const string TelemetrySuffix = "telemetry";
    public const string CommandSuffix = "command";
    public const string CommandAckSuffix = "command_ack";
    public const string CommandResultSuffix = "command_result";
    public const string InteractionRequestSuffix = "interaction_request";
    public const string InteractionConfirmSuffix = "interaction_confirm";
    public const string InteractionResultSuffix = "interaction_result";
    public const string TrafficProgressSuffix = "traffic_progress";
    public const string AuthorityStateSuffix = "authority_state";

    public static string HeartbeatFilter(string topicPrefix) =>
        $"{NormalizePrefix(topicPrefix)}/robots/+/heartbeat";

    public static string TelemetryFilter(string topicPrefix) =>
        $"{NormalizePrefix(topicPrefix)}/robots/+/telemetry";

    public static string CommandAckFilter(string topicPrefix) =>
        $"{NormalizePrefix(topicPrefix)}/robots/+/command_ack";

    public static string CommandResultFilter(string topicPrefix) =>
        $"{NormalizePrefix(topicPrefix)}/robots/+/command_result";

    public static string InteractionConfirmFilter(string topicPrefix) =>
        $"{NormalizePrefix(topicPrefix)}/robots/+/interaction_confirm";

    public static string TrafficProgressFilter(string topicPrefix) =>
        $"{NormalizePrefix(topicPrefix)}/robots/+/traffic_progress";

    public static string AuthorityStateFilter(string topicPrefix) =>
        $"{NormalizePrefix(topicPrefix)}/robots/+/authority_state";

    public static string Heartbeat(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/heartbeat";

    public static string Telemetry(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/telemetry";

    public static string Command(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/command";

    public static string CommandAck(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/command_ack";

    public static string CommandResult(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/command_result";

    /// <summary>Backend → robot only (manual drive); the backend never subscribes to it.</summary>
    public static string Teleop(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/teleop";

    /// <summary>Backend → robot: arm physical HUMAN_INTERACTION confirm button.</summary>
    public static string InteractionRequest(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/interaction_request";

    /// <summary>Robot → backend: physical button confirmation.</summary>
    public static string InteractionConfirm(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/interaction_confirm";

    /// <summary>Backend → robot: business acceptance of interaction_confirm.</summary>
    public static string InteractionResult(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/interaction_result";

    public static string TrafficProgress(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/traffic_progress";

    public static string AuthorityState(string topicPrefix, string robotCode) =>
        $"{NormalizePrefix(topicPrefix)}/robots/{robotCode}/authority_state";

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
        return kind is HeartbeatSuffix
            or TelemetrySuffix
            or CommandSuffix
            or CommandAckSuffix
            or CommandResultSuffix
            or InteractionRequestSuffix
            or InteractionConfirmSuffix
            or InteractionResultSuffix
            or TrafficProgressSuffix
            or AuthorityStateSuffix;
    }

    public static string NormalizePrefix(string topicPrefix) =>
        string.IsNullOrWhiteSpace(topicPrefix)
            ? "warotrans/v1"
            : topicPrefix.Trim().TrimEnd('/');
}

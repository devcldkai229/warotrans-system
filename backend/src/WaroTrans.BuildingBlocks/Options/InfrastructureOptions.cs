namespace WaroTrans.BuildingBlocks.Options;

public sealed class PostgresOptions
{
    public const string SectionName = "Postgres";

    public string ConnectionString { get; set; } = string.Empty;
}

public sealed class MongoOptions
{
    public const string SectionName = "Mongo";

    public string ConnectionString { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = "warotrans_operations";
}

public sealed class MqttOptions
{
    public const string SectionName = "Mqtt";

    /// <summary>
    /// IPv4 literal on purpose: on Windows "localhost" resolves to ::1 first, and a broker listening on IPv4 only
    /// (Docker / WSL mosquitto) makes every new connection hang ~21 s before falling back to 127.0.0.1.
    /// </summary>
    public string Host { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 1883;
    /// <summary>Max wait to (re)connect the command publisher; a publish fails instead of hanging.</summary>
    public int ConnectTimeoutSeconds { get; set; } = 5;
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string ClientId { get; set; } = "warotrans-host";
    public string TopicPrefix { get; set; } = "warotrans/v1";
    public int HeartbeatTimeoutSeconds { get; set; } = 5;
    /// <summary>Max wait for command_ack after publish (counted from RobotCommand.PublishedAt).</summary>
    public int CommandAckTimeoutSeconds { get; set; } = 10;
}

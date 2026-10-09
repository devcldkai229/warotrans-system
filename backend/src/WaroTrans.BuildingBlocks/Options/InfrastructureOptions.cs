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

    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 1883;
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string ClientId { get; set; } = "warotrans-host";
    public string TopicPrefix { get; set; } = "warotrans/v1";
    public int HeartbeatTimeoutSeconds { get; set; } = 5;
}

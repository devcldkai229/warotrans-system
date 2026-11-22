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

    /// <summary>
    /// Adds the process id to the client ids (<c>{ClientId}-{pid}</c>, <c>{ClientId}-cmd-pub-{pid}</c>) so a Host killed
    /// uncleanly on a laptop is not taken over by its own restart. False for AWS IoT Core: its policy allows fixed
    /// client ids only (<c>{ClientId}</c> and <c>{ClientId}-cmd-pub</c>), and in a container the pid is always 1 anyway.
    /// </summary>
    public bool ClientIdIncludesProcessId { get; set; } = true;

    /// <summary>MQTT over TLS (AWS IoT Core: port 8883, an X.509 client certificate).</summary>
    public bool UseTls { get; set; }

    /// <summary>PEM of the client certificate (AWS IoT Core thing certificate); or <see cref="ClientCertificateFile"/>.</summary>
    public string? ClientCertificatePem { get; set; }
    public string? ClientCertificateFile { get; set; }

    /// <summary>PEM of the client certificate's private key; or <see cref="ClientPrivateKeyFile"/>. Never logged.</summary>
    public string? ClientPrivateKeyPem { get; set; }
    public string? ClientPrivateKeyFile { get; set; }

    /// <summary>
    /// PEM of the CA that signed the broker's certificate, when it is not in the system trust store (a local test
    /// broker). Empty: the system store (it holds Amazon Root CA 1 for AWS IoT Core).
    /// </summary>
    public string? CaCertificatePem { get; set; }
    public string? CaCertificateFile { get; set; }

    public string TopicPrefix { get; set; } = "warotrans/v1";
    public int HeartbeatTimeoutSeconds { get; set; } = 5;
    /// <summary>Max wait for command_ack after publish (counted from RobotCommand.PublishedAt).</summary>
    public int CommandAckTimeoutSeconds { get; set; } = 10;
    /// <summary>
    /// Max wait for command_result after ACK/RUNNING (NAVIGATE only). 0 disables.
    /// Lab default keeps long moves from hanging forever without a RESULT.
    /// </summary>
    public int CommandResultTimeoutSeconds { get; set; } = 600;
}

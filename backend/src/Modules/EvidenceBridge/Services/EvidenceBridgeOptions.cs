namespace WaroTrans.EvidenceBridge.Services;

public sealed class EvidenceBridgeOptions
{
    public const string SectionName = "EvidenceBridge";
    public const int MinimumServiceTokenLength = 32;

    /// <summary>Off: no event is captured and nothing is sent (integration tests, a Host without Evidence).</summary>
    public bool Enabled { get; set; }

    public string RecorderBaseUrl { get; set; } = "http://localhost:5095";

    /// <summary>Shared secret both ways: Host → Recorder pushes, Recorder → Host reconciliation reads.</summary>
    public string ServiceToken { get; set; } = string.Empty;

    public int BatchSize { get; set; } = 100;
    public int PollIntervalMs { get; set; } = 1000;
    public int MaxBackoffSeconds { get; set; } = 300;
    public int PublishedRetentionDays { get; set; } = 7;
    public int TrafficTapIntervalMs { get; set; } = 1000;
}

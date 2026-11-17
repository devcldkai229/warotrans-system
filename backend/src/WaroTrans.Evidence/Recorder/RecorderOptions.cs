using WaroTrans.Evidence.Status;

namespace WaroTrans.Evidence.Recorder;

public sealed class RecorderOptions
{
    public const string SectionName = "Evidence";

    /// <summary>The Recorder is the only owner of the Evidence migrations (the Worker never migrates).</summary>
    public const string MigrationsAssembly = "WaroTrans.Evidence.Recorder";
    public const int MinimumServiceTokenLength = 32;

    /// <summary>Shared with the monolith's EvidenceBridge: it pushes events with it, and the Recorder reads back with it.</summary>
    public string ServiceToken { get; set; } = string.Empty;

    /// <summary>Base URL of the WaroTrans Host (reconciliation, the caller's capabilities).</summary>
    public string CoreBaseUrl { get; set; } = "http://localhost:5090";

    /// <summary>A run without usable video is PARTIAL evidence (both robots have a camera).</summary>
    public bool VideoRequired { get; set; } = true;

    public int FinalizeGraceMinutes { get; set; } = 15;

    /// <summary>How often open journals are compared with the source of truth.</summary>
    public int ReconcileIntervalSeconds { get; set; } = 300;

    /// <summary>How often time-dependent statuses (grace periods) are recomputed.</summary>
    public int MaintenanceIntervalSeconds { get; set; } = 60;

    public int MaxBatchEvents { get; set; } = 500;

    public EvidencePolicy Policy => new(VideoRequired, TimeSpan.FromMinutes(Math.Max(0, FinalizeGraceMinutes)));
}

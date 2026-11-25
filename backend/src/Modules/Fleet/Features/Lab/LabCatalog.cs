namespace WaroTrans.Fleet.Features.Lab;

public sealed class LabOptions
{
    public const string SectionName = "Lab";

    /// <summary>Test benches only. Off: no /api/lab routes at all (404) and nothing can be injected.</summary>
    public bool Enabled { get; set; }
}

public static class LabExecutors
{
    /// <summary>The robot's gateway applies it (it must run with LAB_ENABLED=true); it ends by itself after the TTL.</summary>
    public const string Robot = "ROBOT";

    /// <summary>The backend applies it (traffic phantom).</summary>
    public const string Host = "HOST";

    /// <summary>A person does it (wrong scan, nobody confirms, Host restart); the Lab only records when.</summary>
    public const string Operator = "OPERATOR";
}

/// <param name="Expected">Detector(s) the AI should raise (grading only, never shown to the AI).</param>
/// <param name="RobotCount">Robots the scenario needs (2: both robots of one request).</param>
public sealed record LabScenario(
    string Id,
    string Title,
    string Description,
    string Executor,
    int DefaultTtlSeconds,
    IReadOnlyList<string> Expected,
    IReadOnlyDictionary<string, string> DefaultParameters,
    int RobotCount = 1);

/// <summary>Faults a test bench can inject (WaroTrans_Fault_Injection_Lab_Design.md, the ones one robot on a stand can do).</summary>
public static class LabCatalog
{
    private static readonly Dictionary<string, string> None = [];

    public static readonly IReadOnlyList<LabScenario> All =
    [
        new("IOT-01", "MQTT link lost", "The robot's gateway drops its MQTT connection and stays off the broker.",
            LabExecutors.Robot, 75, ["ROBOT_OFFLINE_DURING_TRIP", "CONNECTIVITY_CHURN"], None),
        new("IOT-02", "Lidar stopped", "The gateway stops the lidar motor: /scan goes silent.",
            LabExecutors.Robot, 25, ["SENSOR_STALE"], None),
        new("IOT-03", "Robot clock jump", "The robot's clock reports jump forward by offset_s seconds.",
            LabExecutors.Robot, 150, ["CLOCK_JUMP"], new Dictionary<string, string> { ["offset_s"] = "45" }),
        new("NAV-01", "Navigation keeps aborting", "The gateway reports the next count NAVIGATE goals as ABORTED.",
            LabExecutors.Robot, 300, ["NAV_ABORT_LOOP"], new Dictionary<string, string> { ["count"] = "4" }),
        new("NAV-02", "MOVE frozen", "The gateway accepts the next MOVE but never starts driving until the TTL ends.",
            LabExecutors.Robot, 420, ["MOVE_STUCK"], None),
        new("MAP-01", "Wrong map bundle", "The gateway proposes its plans with another map fingerprint.",
            LabExecutors.Robot, 90, ["MAP_FINGERPRINT_MISMATCH"], None),
        new("TRA-01", "Phantom reservation", "A phantom holds the cells of a disc (x, y, r) on the robot's way.",
            LabExecutors.Host, 200, ["TRAFFIC_WAIT_TOO_LONG"],
            new Dictionary<string, string> { ["x"] = "", ["y"] = "", ["r"] = "0.30" }),
        new("TRA-02", "Head-on pair", "Two robots are sent through the same corridor in opposite directions.",
            LabExecutors.Operator, 600, ["DEADLOCK_RISK_PERSISTENT", "DEADLOCK_LIVELOCK"], None, RobotCount: 2),
        new("OPS-01", "Host restart mid-trip", "The backend is stopped and started again while the trip runs.",
            LabExecutors.Operator, 120, ["HOST_RESTART_MID_JOB"], None),
        new("OPS-02", "Wrong container scanned", "Staff scans another container's label at a handover.",
            LabExecutors.Operator, 120, ["WRONG_CONTAINER_SCAN"], None),
        new("OPS-03", "Nobody confirms", "Staff does not confirm a handover for several minutes.",
            LabExecutors.Operator, 300, ["HUMAN_STEP_WAITING_TOO_LONG"], None),
        new("OPS-04", "Stale command result", "The gateway still reports SUCCEEDED for a command after it was cancelled.",
            LabExecutors.Robot, 300, ["STALE_COMMAND_RESULT"], None),
    ];

    public static LabScenario? Find(string id) =>
        All.FirstOrDefault(s => string.Equals(s.Id, id, StringComparison.OrdinalIgnoreCase));
}

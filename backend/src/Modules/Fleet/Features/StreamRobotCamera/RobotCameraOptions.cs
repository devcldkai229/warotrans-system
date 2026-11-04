namespace WaroTrans.Fleet.Features.StreamRobotCamera;

/// <summary>
/// Where each robot serves its MJPEG camera stream, keyed by robot code
/// (e.g. <c>RobotCamera:Robots:RBT-001 = http://warotrans.local:8081/stream</c>). A robot without an entry has no camera.
/// </summary>
public sealed class RobotCameraOptions
{
    public const string SectionName = "RobotCamera";

    /// <summary>How long to wait for the robot to answer before reporting the camera unavailable.</summary>
    public int ConnectTimeoutSeconds { get; set; } = 3;

    public Dictionary<string, string> Robots { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

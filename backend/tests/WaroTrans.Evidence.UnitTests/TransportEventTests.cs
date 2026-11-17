using System.Text.Json;
using WaroTrans.Evidence.Contracts;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Recorder.Features.Integrations;
using WaroTrans.Evidence.Recorder.Features.Integrations.IngestTransportEvents;

namespace WaroTrans.Evidence.UnitTests;

public class TransportEventTests
{
    private static TransportEventEnvelope Envelope(
        string type,
        string? status = null,
        object? payload = null,
        Guid? request = null,
        string? robot = "RBT-001",
        Guid? assignment = null,
        Guid? job = null) =>
        new(Guid.NewGuid(), 1, type, DateTimeOffset.UtcNow, "warotrans-core", request, "REQ-20261117-000001",
            job, "JOB-20261117-000001", null, Guid.NewGuid(), robot, assignment, status,
            JsonSerializer.SerializeToElement(payload ?? new { }));

    [Fact]
    public void An_assignment_event_without_its_keys_is_refused()
    {
        var e = Envelope(TransportEventTypes.JobRobotAssignmentChanged, "OPENED", request: Guid.NewGuid());
        Assert.Equal("assignment_event_incomplete", IngestTransportEventsHandler.Problem(e));

        var complete = e with { AssignmentId = Guid.NewGuid(), JobId = Guid.NewGuid() };
        Assert.Null(IngestTransportEventsHandler.Problem(complete));
    }

    [Fact]
    public void Unknown_types_and_versions_are_refused_not_guessed()
    {
        Assert.StartsWith("event_type_unknown", IngestTransportEventsHandler.Problem(Envelope("job.teleported", request: Guid.NewGuid())));
        Assert.StartsWith("schema_version_unsupported",
            IngestTransportEventsHandler.Problem(Envelope(TransportEventTypes.JobStatusChanged, request: Guid.NewGuid()) with { SchemaVersion = 2 }));
    }

    [Fact]
    public void Trip_events_need_their_request_and_robot_events_their_robot()
    {
        Assert.Equal("transport_request_missing", IngestTransportEventsHandler.Problem(Envelope(TransportEventTypes.JobStatusChanged)));
        Assert.Equal("robot_code_missing", IngestTransportEventsHandler.Problem(Envelope(TransportEventTypes.RobotErrorReported, robot: null)));
        Assert.Null(IngestTransportEventsHandler.Problem(Envelope(TransportEventTypes.RobotErrorReported, "E_STOP")));
    }

    [Theory]
    [InlineData("FAILED", EvidenceSeverity.ERROR)]
    [InlineData("RECOVERY_REQUIRED", EvidenceSeverity.WARNING)]
    [InlineData("COMPLETED", EvidenceSeverity.INFO)]
    public void Job_status_severity(string status, EvidenceSeverity expected)
    {
        var c = EventClassifier.Classify(Envelope(TransportEventTypes.JobStatusChanged, status, new { failureCode = "x" }, Guid.NewGuid()));
        Assert.Equal(EvidenceEventCategory.FLEET, c.Category);
        Assert.Equal(expected, c.Severity);
        Assert.Contains(status, c.Message);
    }

    [Fact]
    public void A_failed_navigation_result_is_an_error_with_its_code()
    {
        var c = EventClassifier.Classify(Envelope(TransportEventTypes.RobotCommandLifecycle, "RESULT",
            new { type = "NAVIGATE_TO_POSE", outcome = "FAILED", errorCode = "NAVIGATION_BLOCKED" }, Guid.NewGuid()));
        Assert.Equal(EvidenceEventCategory.NAVIGATION, c.Category);
        Assert.Equal(EvidenceSeverity.ERROR, c.Severity);
        Assert.Contains("NAVIGATION_BLOCKED", c.Message);
    }

    [Fact]
    public void A_wait_for_cycle_is_a_traffic_warning_placed_on_the_map()
    {
        var c = EventClassifier.Classify(Envelope(TransportEventTypes.TrafficWaitChanged, "DeadlockRisk",
            new { blockingOwnerCode = "RBT-002", x = 1.25, y = -0.5 }));
        Assert.Equal(EvidenceEventCategory.TRAFFIC, c.Category);
        Assert.Equal(EvidenceSeverity.WARNING, c.Severity);
        Assert.Equal(1.25, c.X);
        Assert.Equal(-0.5, c.Y);
        Assert.Contains("RBT-002", c.Message);
    }

    [Fact]
    public void Robot_scoped_events_are_the_robot_wide_ones()
    {
        Assert.True(TransportEventTypes.IsRobotScoped(TransportEventTypes.TrafficWaitChanged));
        Assert.True(TransportEventTypes.IsRobotScoped(TransportEventTypes.RobotConnectivityChanged));
        Assert.False(TransportEventTypes.IsRobotScoped(TransportEventTypes.RobotCommandLifecycle));
        Assert.False(TransportEventTypes.IsRobotScoped(TransportEventTypes.JobRobotAssignmentChanged));
    }
}

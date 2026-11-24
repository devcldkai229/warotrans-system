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
    public void A_step_with_details_reads_as_its_place_name_and_target()
    {
        var c = EventClassifier.Classify(Envelope(TransportEventTypes.JobStepStatusChanged, "EXECUTING",
            new { stepKey = "move_to_drop", stepName = "Move to shelf", stepPosition = 4, stepCount = 9, targetEndpointCode = "EP-SHELF-A-1" },
            Guid.NewGuid()));
        Assert.Equal(EvidenceSeverity.INFO, c.Severity);
        Assert.Contains("4/9 Move to shelf (EP-SHELF-A-1)", c.Message);
    }

    [Fact]
    public void A_step_without_details_falls_back_to_its_key()
    {
        var c = EventClassifier.Classify(Envelope(TransportEventTypes.JobStepStatusChanged, "COMPLETED",
            new { stepKey = "move_to_drop" }, Guid.NewGuid()));
        Assert.Contains("Step move_to_drop", c.Message);
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

    [Fact]
    public void A_traffic_decision_is_accepted_robot_scoped_and_reads_as_the_decision()
    {
        var e = Envelope(TransportEventTypes.TrafficDecision, "deadlock-retreat",
            new { kind = "deadlock-retreat", code = "deadlock-retreat", severity = "WARNING",
                  detail = "job=J1:waited-for=RBT-001:to=EP-QUEUE-A", x = 1.0, y = 2.0 });
        Assert.Null(IngestTransportEventsHandler.Problem(e));
        Assert.True(TransportEventTypes.IsRobotScoped(TransportEventTypes.TrafficDecision));
        var c = EventClassifier.Classify(e);
        Assert.Equal(EvidenceEventCategory.TRAFFIC, c.Category);
        Assert.Equal(EvidenceSeverity.WARNING, c.Severity);
        Assert.Contains("backs off", c.Message);
        Assert.Contains("waited-for=RBT-001", c.Message);
    }

    [Fact]
    public void Lab_events_need_a_request_or_a_robot()
    {
        Assert.Null(IngestTransportEventsHandler.Problem(Envelope(TransportEventTypes.LabFaultInjected, "IOT-01", request: Guid.NewGuid(), robot: null)));
        Assert.Null(IngestTransportEventsHandler.Problem(Envelope(TransportEventTypes.LabFaultCleared, "IOT-01")));
        Assert.Equal("request_or_robot_missing",
            IngestTransportEventsHandler.Problem(Envelope(TransportEventTypes.LabFaultInjected, "IOT-01", robot: null)));
        Assert.Equal("transport_request_missing", IngestTransportEventsHandler.Problem(Envelope(TransportEventTypes.HostStarted, "RUNNING")));
    }

    [Fact]
    public void New_evidence_events_read_as_one_line()
    {
        var lab = EventClassifier.Classify(Envelope(TransportEventTypes.LabFaultInjected, "NAV-01",
            new { title = "Navigation keeps aborting", ttlSeconds = 300 }, Guid.NewGuid()));
        Assert.Equal("LAB fault NAV-01 injected on RBT-001: Navigation keeps aborting (300 s)", lab.Message);
        var scan = EventClassifier.Classify(Envelope(TransportEventTypes.HandoverScanRejected, "MISMATCH",
            new { scannedBarcode = "CNT-2", expectedBarcode = "CNT-1" }, Guid.NewGuid()));
        Assert.Equal(EvidenceSeverity.WARNING, scan.Severity);
        Assert.Contains("CNT-2 (expected CNT-1)", scan.Message);
        var stale = EventClassifier.Classify(Envelope(TransportEventTypes.RobotCommandLifecycle, "STALE_RESULT",
            new { type = "NAVIGATE_TO_POSE", outcome = "FAILED" }, Guid.NewGuid()));
        Assert.Equal(EvidenceSeverity.ERROR, stale.Severity);
    }
}

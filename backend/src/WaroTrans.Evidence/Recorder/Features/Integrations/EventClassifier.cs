using System.Text.Json;
using WaroTrans.Evidence.Contracts;
using WaroTrans.Evidence.Enums;

namespace WaroTrans.Evidence.Recorder.Features.Integrations;

/// <summary>
/// Files a source event for the investigation timeline: which panel (category), how loud (severity), one line of text.
/// Reads the source's own status strings; it never turns them into Evidence statuses.
/// </summary>
internal static class EventClassifier
{
    public sealed record Classification(EvidenceEventCategory Category, EvidenceSeverity Severity, string Message, double? X, double? Y);

    public static Classification Classify(TransportEventEnvelope e)
    {
        var status = e.SourceStatusCode ?? string.Empty;
        var job = e.JobNo is null ? "" : $" {e.JobNo}";
        var robot = e.RobotCode is null ? "" : $" {e.RobotCode}";
        return e.EventType switch
        {
            TransportEventTypes.TransportRequestProgressed => new(EvidenceEventCategory.CARGO,
                status == "FAILED" ? EvidenceSeverity.ERROR : Int(e.Payload, "failedDetails") > 0 ? EvidenceSeverity.WARNING : EvidenceSeverity.INFO,
                $"Request {e.RequestCode} {status}: {Int(e.Payload, "completedDetails")}/{Int(e.Payload, "totalDetails")} delivered, {Int(e.Payload, "failedDetails")} failed",
                null, null),
            TransportEventTypes.TransportRequestClosed => new(EvidenceEventCategory.CARGO, EvidenceSeverity.WARNING,
                $"Request {e.RequestCode} closed by an operator ({status}): {Str(e.Payload, "reason")}", null, null),
            TransportEventTypes.JobStatusChanged => new(EvidenceEventCategory.FLEET,
                status switch
                {
                    "FAILED" => EvidenceSeverity.ERROR,
                    "RECOVERY_REQUIRED" or "REASSIGNING" or "PAUSED" or "CANCELLED" => EvidenceSeverity.WARNING,
                    _ => EvidenceSeverity.INFO
                },
                $"Trip{job} {status}{Suffix(Str(e.Payload, "failureCode"))}", null, null),
            TransportEventTypes.JobStepStatusChanged => new(EvidenceEventCategory.FLEET,
                status == "FAILED" ? EvidenceSeverity.ERROR : EvidenceSeverity.INFO,
                $"Step {StepLabel(e.Payload)} of{job} {status}{Suffix(Str(e.Payload, "errorCode"))}", null, null),
            TransportEventTypes.JobContainerStatusChanged => new(EvidenceEventCategory.CARGO,
                status == "FAILED" ? EvidenceSeverity.ERROR : EvidenceSeverity.INFO,
                $"Container {Str(e.Payload, "containerId")} {status}", null, null),
            TransportEventTypes.JobRobotAssignmentChanged => new(EvidenceEventCategory.FLEET,
                Str(e.Payload, "endReason") is "REASSIGNED" or "FAILED" or "QUEUED" ? EvidenceSeverity.WARNING : EvidenceSeverity.INFO,
                status == "OPENED"
                    ? $"{e.RobotCode ?? "Robot"} took trip{job} ({Str(e.Payload, "startReason")})"
                    : $"{e.RobotCode ?? "Robot"} left trip{job} ({Str(e.Payload, "endReason")})",
                null, null),
            TransportEventTypes.RobotCommandLifecycle => Command(e, robot),
            TransportEventTypes.RobotConnectivityChanged => new(EvidenceEventCategory.FLEET,
                status == "OFFLINE" ? EvidenceSeverity.ERROR : EvidenceSeverity.INFO,
                $"{e.RobotCode} {(status == "OFFLINE" ? "went offline" : "came back online")}", null, null),
            TransportEventTypes.RobotErrorReported => new(EvidenceEventCategory.HARDWARE, EvidenceSeverity.ERROR,
                $"{e.RobotCode} reports {status}", null, null),
            TransportEventTypes.RobotBatteryLow => new(EvidenceEventCategory.HARDWARE, EvidenceSeverity.WARNING,
                $"{e.RobotCode} battery low ({Str(e.Payload, "batteryPercent")}%)", null, null),
            TransportEventTypes.RobotGatewayRestarted => new(EvidenceEventCategory.SYSTEM, EvidenceSeverity.WARNING,
                $"{e.RobotCode} gateway restarted", null, null),
            TransportEventTypes.TrafficWaitChanged => Traffic(e),
            TransportEventTypes.TrafficDecision => Decision(e),
            _ => new(EvidenceEventCategory.SYSTEM, EvidenceSeverity.INFO, e.EventType, null, null)
        };
    }

    /// <summary>"4/9 Move to shelf (EP-SHELF-A-1)" when the core sent the step details, else the bare step key.</summary>
    private static string StepLabel(JsonElement payload)
    {
        var name = Str(payload, "stepName");
        if (string.IsNullOrEmpty(name))
        {
            return Str(payload, "stepKey") ?? "";
        }

        var position = Int(payload, "stepPosition");
        var count = Int(payload, "stepCount");
        var target = Str(payload, "targetEndpointCode");
        return $"{(position > 0 && count > 0 ? $"{position}/{count} " : "")}{name}{(string.IsNullOrEmpty(target) ? "" : $" ({target})")}";
    }

    private static Classification Command(TransportEventEnvelope e, string robot)
    {
        var phase = e.SourceStatusCode ?? string.Empty;
        var outcome = Str(e.Payload, "outcome");
        var type = Str(e.Payload, "type");
        var error = Str(e.Payload, "errorCode");
        var severity = phase switch
        {
            "ACK_REJECTED" or "ACK_TIMEOUT" or "OFFLINE_ABORT" => EvidenceSeverity.ERROR,
            "RESULT" when outcome == "FAILED" => EvidenceSeverity.ERROR,
            "RESULT" when outcome == "CANCELED" => EvidenceSeverity.WARNING,
            _ => EvidenceSeverity.INFO
        };
        var text = phase == "RESULT" ? $"{type}{robot} {outcome}{Suffix(error)}" : $"{type}{robot} {phase}{Suffix(error)}";
        return new(EvidenceEventCategory.NAVIGATION, severity, text, null, null);
    }

    private static Classification Traffic(TransportEventEnvelope e)
    {
        var reason = e.SourceStatusCode ?? "None";
        var owner = Str(e.Payload, "blockingOwnerCode");
        var severity = reason switch
        {
            "DeadlockRisk" => EvidenceSeverity.WARNING,
            _ => EvidenceSeverity.INFO
        };
        var text = reason == "None"
            ? $"{e.RobotCode} stops waiting ({Str(e.Payload, "previousReason")})"
            : $"{e.RobotCode} waits: {reason}{(owner is null ? "" : $" behind {owner}")}";
        return new(EvidenceEventCategory.TRAFFIC, severity, text, Num(e.Payload, "x"), Num(e.Payload, "y"));
    }

    /// <summary>"RBT-002 plan refused (deadlock-reject-semantic)"; severity as the coordinator rated it.</summary>
    private static Classification Decision(TransportEventEnvelope e)
    {
        var kind = Str(e.Payload, "kind") ?? e.SourceStatusCode ?? "decision";
        var code = Str(e.Payload, "code");
        var detail = Str(e.Payload, "detail");
        var severity = Str(e.Payload, "severity") switch
        {
            "ERROR" => EvidenceSeverity.ERROR,
            "WARNING" => EvidenceSeverity.WARNING,
            _ => EvidenceSeverity.INFO
        };
        var text = kind switch
        {
            "plan-granted" => $"{e.RobotCode} plan granted",
            "plan-rejected" => $"{e.RobotCode} plan refused",
            "revoked" => $"{e.RobotCode} grant revoked",
            "safe-stop" => $"{e.RobotCode} safe stop",
            "quarantined" => $"{e.RobotCode} quarantined by traffic",
            "deadlock-retreat" => $"{e.RobotCode} backs off to break a deadlock",
            "goal-wait" => $"{e.RobotCode} waits for its goal",
            _ => $"{e.RobotCode} traffic {kind}"
        };
        var why = string.IsNullOrEmpty(detail) ? code : $"{code}: {detail}";
        return new(EvidenceEventCategory.TRAFFIC, severity, string.IsNullOrEmpty(why) ? text : $"{text} ({why})",
            Num(e.Payload, "x"), Num(e.Payload, "y"));
    }

    private static string Suffix(string? code) => string.IsNullOrEmpty(code) ? "" : $" ({code})";

    public static string? Str(JsonElement payload, string name) =>
        payload.ValueKind == JsonValueKind.Object && payload.TryGetProperty(name, out var value)
            ? value.ValueKind switch
            {
                JsonValueKind.String => value.GetString(),
                JsonValueKind.Null or JsonValueKind.Undefined => null,
                _ => value.ToString()
            }
            : null;

    public static double? Num(JsonElement payload, string name) =>
        payload.ValueKind == JsonValueKind.Object && payload.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number)
            ? number
            : null;

    private static int Int(JsonElement payload, string name) => (int)(Num(payload, name) ?? 0);
}

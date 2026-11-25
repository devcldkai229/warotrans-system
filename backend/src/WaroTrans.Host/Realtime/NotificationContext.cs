using System.Globalization;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Operations.Contracts;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Host.Realtime;

/// <summary>
/// What a robot or Job notification needs to be acted on without hunting for it: where the robot was, its battery, the
/// Job and step it was on, and links to each of them. Every line is one sentence the web recognises and translates
/// (notificationText.ts), so a notification is a few short lines, not one long sentence. Lookups that fail leave a
/// line out; a notification is never lost because its context could not be read.
/// </summary>
public sealed class NotificationContext(
    IFleetModule? fleet = null,
    IJobEvidenceQuery? jobs = null,
    INavigationModule? navigation = null,
    ITransportRequestCodeLookup? requestCodes = null,
    ILogger<NotificationContext>? logger = null)
{
    private static readonly string[] Finished = ["COMPLETED", "FAILED", "CANCELLED"];

    /// <summary>Within this distance the robot is said to be "at" the endpoint.</summary>
    public const double AtEndpointMeters = 0.6;

    public sealed class Builder
    {
        public List<string> Lines { get; } = [];
        public List<NotificationLink> Links { get; } = [];

        public string Content => string.Join("\n", Lines.Where(l => !string.IsNullOrWhiteSpace(l)));

        public void Line(string? line)
        {
            if (!string.IsNullOrWhiteSpace(line)) Lines.Add(line);
        }

        public void Link(string kind, string text, string route)
        {
            if (Links.All(l => l.Route != route)) Links.Add(new NotificationLink(kind, text, route));
        }

        public void Robot(string code)
        {
            Link("ROBOT", code, $"/monitor/fleet/{Uri.EscapeDataString(code)}");
            Link("TECHNICAL", code, $"/monitor/fleet/{Uri.EscapeDataString(code)}/technical");
            Link("HISTORY", code, $"/operations/robot-history?robot={Uri.EscapeDataString(code)}");
        }
    }

    public sealed record RobotFacts(RobotSnapshot Robot, string? Place, JobEvidenceContext? Job);

    /// <summary>The robot, where it last was and the Job it holds (if any).</summary>
    public async Task<RobotFacts?> RobotAsync(Guid robotId, CancellationToken cancellationToken)
    {
        if (fleet is null) return null;
        try
        {
            var robot = await fleet.GetRobotAsync(robotId, cancellationToken);
            if (robot is null) return null;
            var place = await PlaceAsync(robot, cancellationToken);
            JobEvidenceContext? job = null;
            if (jobs is not null)
            {
                foreach (var id in await fleet.GetRecentJobIdsAsync(robotId, 1, cancellationToken))
                {
                    var candidate = await jobs.GetJobAsync(id, cancellationToken);
                    if (candidate is not null && !Finished.Contains(candidate.Status)) job = candidate;
                }
            }

            return new RobotFacts(robot, place, job);
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "Notification context of robot {RobotId} not read", robotId);
            return null;
        }
    }

    /// <summary>Adds "Last position", "Battery" and "Job" lines and the robot / Job links.</summary>
    public async Task DescribeRobotAsync(Builder b, RobotFacts facts, CancellationToken cancellationToken, bool withJob = true)
    {
        b.Line(facts.Place is null ? null : facts.Place);
        if (facts.Robot.BatteryPercent is { } battery)
            b.Line(string.Create(CultureInfo.InvariantCulture, $"Battery {battery:0}%."));
        if (withJob && facts.Job is { } job)
        {
            b.Line($"It holds Job {job.JobNo} ({job.Status}).");
            await DescribeJobLinksAsync(b, job, cancellationToken);
        }

        b.Robot(facts.Robot.Code);
    }

    public async Task<JobEvidenceContext?> JobAsync(Guid jobId, CancellationToken cancellationToken)
    {
        if (jobs is null) return null;
        try
        {
            return await jobs.GetJobAsync(jobId, cancellationToken);
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "Notification context of job {JobId} not read", jobId);
            return null;
        }
    }

    /// <summary>The Job, its transport request and the request's replay.</summary>
    public async Task DescribeJobLinksAsync(Builder b, JobEvidenceContext job, CancellationToken cancellationToken)
    {
        b.Link("JOB", job.JobNo, $"/monitor/jobs/{job.JobId}");
        if (job.TransportRequestId is not { } requestId) return;
        var code = requestId.ToString()[..8];
        if (requestCodes is not null)
        {
            try
            {
                var codes = await requestCodes.GetCodesAsync([requestId], cancellationToken);
                if (codes.TryGetValue(requestId, out var found)) code = found;
            }
            catch (Exception ex)
            {
                logger?.LogDebug(ex, "Request code of {RequestId} not read", requestId);
            }
        }

        b.Link("REQUEST", code, $"/monitor/requests?requestId={requestId}");
        b.Link("JOURNAL", code, $"/monitor/journals/by-request/{requestId}");
    }

    /// <summary>"Job J…, step "…"." and "Target: …" for a command of a Job step.</summary>
    public async Task DescribeStepAsync(Builder b, Guid? jobStepId, CancellationToken cancellationToken)
    {
        if (jobs is null || jobStepId is not { } stepId) return;
        try
        {
            var jobId = await jobs.GetJobIdOfStepAsync(stepId, cancellationToken);
            var job = jobId is { } id ? await jobs.GetJobAsync(id, cancellationToken) : null;
            var step = await jobs.GetStepAsync(stepId, cancellationToken);
            if (job is not null && step is not null) b.Line($"Job {job.JobNo}, step \"{step.StepName}\".");
            else if (job is not null) b.Line($"It holds Job {job.JobNo} ({job.Status}).");
            if (step?.TargetEndpointId is { } target && navigation is not null
                && await navigation.GetEndpointPoseAsync(target, cancellationToken) is { } pose)
                b.Line($"Target: {pose.Code}.");
            if (job is not null) await DescribeJobLinksAsync(b, job, cancellationToken);
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "Notification context of step {StepId} not read", jobStepId);
        }
    }

    private async Task<string?> PlaceAsync(RobotSnapshot robot, CancellationToken cancellationToken)
    {
        if (navigation is null || robot.LastTelemetryAt is null) return null;
        var endpoints = await navigation.GetEndpointsOnMapAsync(robot.CurrentMapVersionId, cancellationToken);
        var nearest = endpoints
            .Select(e => (e, d: Math.Sqrt(Math.Pow(e.X - robot.PoseX, 2) + Math.Pow(e.Y - robot.PoseY, 2))))
            .OrderBy(x => x.d)
            .FirstOrDefault();
        if (nearest.e is null)
            return string.Create(CultureInfo.InvariantCulture, $"Last position: x {robot.PoseX:0.00}, y {robot.PoseY:0.00}.");
        var name = string.IsNullOrWhiteSpace(nearest.e.Name) ? nearest.e.Code : nearest.e.Name;
        return nearest.d <= AtEndpointMeters
            ? $"Last position: at {name}."
            : string.Create(CultureInfo.InvariantCulture, $"Last position: {nearest.d:0.0} m from {name}.");
    }

    /// <summary>What a robot's refusal code means, in a sentence an operator can act on. Null for an unknown code.</summary>
    public static string? RejectMeaning(string? code) => code?.Trim().ToUpperInvariant() switch
    {
        "BUSY" => "The robot is busy with another command or a restart.",
        "UNKNOWN_TARGET" => "The robot had no such command running, so there was nothing to cancel.",
        "NOT_LOCALIZED" or "LOCALIZATION_LOST" => "The robot does not know where it is: localize it.",
        "MOTION_HELD" or "MOTION_NOT_HELD" => "The robot's stop state did not allow it: stop or resume the robot first.",
        "MAP_MISMATCH" or "MAP_VERSION_MISMATCH" => "The robot runs another map than the command: change its map.",
        "COMMAND_EXPIRED" => "The command arrived too late: check the robot's clock and Wi-Fi.",
        "NAV2_UNAVAILABLE" => "Navigation (Nav2) is not running on the robot: restart Nav2 or the stack.",
        "ACTION_NOT_PERMITTED" => "The robot is not set up for this action (run the install script on the robot).",
        "UNSUPPORTED_COMMAND" => "The robot's software does not support this command: update the robot.",
        "WRONG_ROBOT" => "The command was meant for another robot.",
        "JOB_MISMATCH" => "The command belongs to another Job than the robot is running.",
        "AUTHORITY_REQUIRED" or "AUTHORITY_STALE_EPOCH" or "AUTHORITY_STALE_SEQ" or "AUTHORITY_EXPIRED"
            or "AUTHORITY_MISMATCH" or "AUTHORITY_LOST" or "ROUTE_NOT_AUTHORIZED" => "Traffic control did not allow the move: the robot waits for its path to clear.",
        "INVALID_PAYLOAD" => "The command was malformed: report this to the developers.",
        _ => null
    };
}

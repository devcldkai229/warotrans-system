using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.EvidenceBridge.Contracts;
using WaroTrans.EvidenceBridge.Services;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Transportation.IntegrationEvents;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.EvidenceBridge.Features.Capture;

/// <summary>
/// Turns the events the monolith already publishes into Evidence envelopes in the outbox, adding what the Recorder
/// needs to file them (request, trip, robot code). Evidence observes: whatever goes wrong here is logged and
/// swallowed, it never fails the business operation that published the event. Trips with no transport request
/// (robot care) are not journeys and are skipped; robot-wide events are kept, the Recorder files them under the
/// robot's open run if it has one.
/// </summary>
internal sealed class EvidenceEventCapture(
    EvidenceOutboxWriter outbox,
    IJobEvidenceQuery jobs,
    ITransportRequestCodeLookup requestCodes,
    ITransportRequestActivityQuery requests,
    IFleetModule fleet,
    INavigationModule navigation,
    IMemoryCache cache,
    IOptions<EvidenceBridgeOptions> options,
    ILogger<EvidenceEventCapture> logger)
    : IIntegrationEventHandler<JobStatusChanged>,
        IIntegrationEventHandler<JobStepStatusChanged>,
        IIntegrationEventHandler<JobContainerStatusChanged>,
        IIntegrationEventHandler<JobRobotAssignmentChanged>,
        IIntegrationEventHandler<TransportRequestProgressed>,
        IIntegrationEventHandler<TransportRequestClosedByOperator>,
        IIntegrationEventHandler<RobotCommandLifecycleChanged>,
        IIntegrationEventHandler<RobotConnectivityChanged>,
        IIntegrationEventHandler<RobotErrorReported>,
        IIntegrationEventHandler<RobotBatteryLow>,
        IIntegrationEventHandler<RobotGatewayRestarted>
{
    private static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(10);

    private sealed record JobRef(Guid JobId, string JobNo, Guid? TransportRequestId, string? RequestCode);

    public Task HandleAsync(JobStatusChanged e, CancellationToken ct = default) =>
        Guarded(e, async () =>
        {
            if (await JobAsync(e.JobId, ct) is not { TransportRequestId: not null } job)
            {
                return null;
            }

            return Envelope(e, EvidenceEventTypes.JobStatusChanged, job, robotId: e.RobotId,
                robotCode: await RobotCodeAsync(e.RobotId, ct), status: e.Status);
        }, ct);

    public Task HandleAsync(JobStepStatusChanged e, CancellationToken ct = default) =>
        Guarded(e, async () =>
            await JobAsync(e.JobId, ct) is { TransportRequestId: not null } job
                ? Envelope(e, EvidenceEventTypes.JobStepStatusChanged, job, jobStepId: e.JobStepId, status: e.Status)
                : null, ct);

    public Task HandleAsync(JobContainerStatusChanged e, CancellationToken ct = default) =>
        Guarded(e, async () =>
        {
            var job = await JobAsync(e.JobId, ct);
            var code = job?.RequestCode ?? await RequestCodeAsync(e.TransportRequestId, ct);
            return Envelope(e, EvidenceEventTypes.JobContainerStatusChanged,
                new JobRef(e.JobId, job?.JobNo ?? string.Empty, e.TransportRequestId, code), status: e.Status);
        }, ct);

    public Task HandleAsync(JobRobotAssignmentChanged e, CancellationToken ct = default) =>
        Guarded(e, async () =>
        {
            if (await jobs.GetJobAsync(e.JobId, ct) is not { TransportRequestId: { } requestId } context)
            {
                return null;
            }

            var requestCode = await RequestCodeAsync(requestId, ct);
            var map = await navigation.GetMapVersionAsync(context.MapVersionId, ct);
            var trips = await jobs.GetJobsOfRequestAsync(requestId, ct);
            var payload = JsonSerializer.SerializeToNode(e, EvidenceOutboxWriter.Json)!.AsObject();
            payload["containerIds"] = JsonSerializer.SerializeToNode(context.ContainerIds, EvidenceOutboxWriter.Json);
            payload["mapVersionId"] = context.MapVersionId;
            payload["mapVersionCode"] = map?.Code;
            payload["jobStatus"] = context.Status;
            payload["requestContainerCount"] = trips.Sum(t => t.ContainerIds.Count);
            payload["transportRequestStatus"] = await requests.GetStatusAsync(requestId, ct);
            var job = new JobRef(e.JobId, e.JobNo, requestId, requestCode);
            return Envelope(e, EvidenceEventTypes.JobRobotAssignmentChanged, job, robotId: e.RobotId,
                robotCode: await RobotCodeAsync(e.RobotId, ct), assignmentId: e.AssignmentId,
                status: e.Phase, payload: JsonSerializer.SerializeToElement(payload, EvidenceOutboxWriter.Json));
        }, ct);

    public Task HandleAsync(TransportRequestProgressed e, CancellationToken ct = default) =>
        Guarded(e, () => Task.FromResult<EvidenceEnvelope?>(Envelope(e, EvidenceEventTypes.TransportRequestProgressed,
            new JobRef(Guid.Empty, string.Empty, e.RequestId, e.RequestCode), status: e.Status.ToString(), noJob: true)), ct);

    public Task HandleAsync(TransportRequestClosedByOperator e, CancellationToken ct = default) =>
        Guarded(e, () => Task.FromResult<EvidenceEnvelope?>(Envelope(e, EvidenceEventTypes.TransportRequestClosed,
            new JobRef(Guid.Empty, string.Empty, e.RequestId, e.RequestCode), status: e.Status.ToString(), noJob: true)), ct);

    public Task HandleAsync(RobotCommandLifecycleChanged e, CancellationToken ct = default) =>
        Guarded(e, async () =>
        {
            // Hand-sent commands are no journey; only commands of a trip step are evidence.
            if (e.JobStepId is not { } stepId || await jobs.GetJobIdOfStepAsync(stepId, ct) is not { } jobId
                || await JobAsync(jobId, ct) is not { TransportRequestId: not null } job)
            {
                return null;
            }

            return Envelope(e, EvidenceEventTypes.RobotCommandLifecycle, job, jobStepId: stepId, robotId: e.RobotId,
                robotCode: e.RobotCode, status: e.Phase);
        }, ct);

    public Task HandleAsync(RobotConnectivityChanged e, CancellationToken ct = default) =>
        Guarded(e, () => Task.FromResult(RobotEnvelope(e, EvidenceEventTypes.RobotConnectivityChanged, e.RobotId, e.RobotCode,
            e.IsOnline ? "ONLINE" : "OFFLINE")), ct);

    public Task HandleAsync(RobotErrorReported e, CancellationToken ct = default) =>
        Guarded(e, () => Task.FromResult(RobotEnvelope(e, EvidenceEventTypes.RobotErrorReported, e.RobotId, e.RobotCode, e.ErrorCode)), ct);

    public Task HandleAsync(RobotBatteryLow e, CancellationToken ct = default) =>
        Guarded(e, () => Task.FromResult(RobotEnvelope(e, EvidenceEventTypes.RobotBatteryLow, e.RobotId, e.RobotCode, null)), ct);

    public Task HandleAsync(RobotGatewayRestarted e, CancellationToken ct = default) =>
        Guarded(e, () => Task.FromResult(RobotEnvelope(e, EvidenceEventTypes.RobotGatewayRestarted, e.RobotId, e.RobotCode, null)), ct);

    private async Task Guarded(IIntegrationEvent e, Func<Task<EvidenceEnvelope?>> build, CancellationToken ct)
    {
        if (!options.Value.Enabled)
        {
            return;
        }

        try
        {
            if (await build() is { } envelope)
            {
                await outbox.WriteAsync(envelope, ct);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Observation only: never fail the operation that published the event.
            logger.LogWarning(ex, "Evidence: could not capture {EventType} {EventId}", e.GetType().Name, e.EventId);
        }
    }

    private static EvidenceEnvelope? RobotEnvelope(IIntegrationEvent e, string type, Guid robotId, string robotCode, string? status) =>
        new(e.EventId, EvidenceEnvelope.CurrentSchemaVersion, type, e.OccurredAt, EvidenceEnvelope.CoreSource,
            null, null, null, null, null, robotId, robotCode, null, status, Serialize(e));

    private static EvidenceEnvelope Envelope(
        IIntegrationEvent e,
        string type,
        JobRef job,
        Guid? jobStepId = null,
        Guid? robotId = null,
        string? robotCode = null,
        Guid? assignmentId = null,
        string? status = null,
        JsonElement? payload = null,
        bool noJob = false) =>
        new(e.EventId, EvidenceEnvelope.CurrentSchemaVersion, type, e.OccurredAt, EvidenceEnvelope.CoreSource,
            job.TransportRequestId, job.RequestCode,
            noJob ? null : job.JobId, noJob || job.JobNo.Length == 0 ? null : job.JobNo,
            jobStepId, robotId, robotCode, assignmentId, status, payload ?? Serialize(e));

    private static JsonElement Serialize(IIntegrationEvent e) =>
        JsonSerializer.SerializeToElement(e, e.GetType(), EvidenceOutboxWriter.Json);

    private async Task<JobRef?> JobAsync(Guid jobId, CancellationToken ct)
    {
        if (cache.TryGetValue(("evidence-job", jobId), out JobRef? cached))
        {
            return cached;
        }

        var context = await jobs.GetJobAsync(jobId, ct);
        if (context is null)
        {
            return null;
        }

        var code = context.TransportRequestId is { } id ? await RequestCodeAsync(id, ct) : null;
        var job = new JobRef(context.JobId, context.JobNo, context.TransportRequestId, code);
        cache.Set(("evidence-job", jobId), job, CacheFor);
        return job;
    }

    private async Task<string?> RequestCodeAsync(Guid requestId, CancellationToken ct)
    {
        if (cache.TryGetValue(("evidence-request-code", requestId), out string? cached))
        {
            return cached;
        }

        var codes = await requestCodes.GetCodesAsync([requestId], ct);
        var code = codes.GetValueOrDefault(requestId);
        if (code is not null)
        {
            cache.Set(("evidence-request-code", requestId), code, CacheFor);
        }

        return code;
    }

    private async Task<string?> RobotCodeAsync(Guid? robotId, CancellationToken ct)
    {
        if (robotId is not { } id)
        {
            return null;
        }

        if (cache.TryGetValue(("evidence-robot-code", id), out string? cached))
        {
            return cached;
        }

        var code = (await fleet.GetRobotAsync(id, ct))?.Code;
        if (code is not null)
        {
            cache.Set(("evidence-robot-code", id), code, CacheFor);
        }

        return code;
    }
}

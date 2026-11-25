using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.EvidenceBridge.Contracts;
using WaroTrans.EvidenceBridge.Services;
using WaroTrans.Fleet.Contracts;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.EvidenceBridge.Features.Capture;

/// <summary>
/// The backend process started: every trip still unfinished at that moment gets a <c>host.started</c> event in its
/// journal (a restart mid-trip loses in-memory traffic and command state; investigations must see when it happened).
/// </summary>
internal sealed class HostStartEvidence(
    IServiceScopeFactory scopes,
    IOptions<EvidenceBridgeOptions> options,
    TimeProvider clock,
    ILogger<HostStartEvidence> logger) : BackgroundService
{
    private static readonly TimeSpan SettleDelay = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled)
        {
            return;
        }

        var startedAt = clock.GetUtcNow();
        await Task.Delay(SettleDelay, clock, stoppingToken);
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var sp = scope.ServiceProvider;
            var jobs = await sp.GetRequiredService<IJobEvidenceQuery>().GetUnfinishedJobsAsync(stoppingToken);
            if (jobs.Count == 0)
            {
                return;
            }

            var outbox = sp.GetRequiredService<EvidenceOutboxWriter>();
            var codes = await sp.GetRequiredService<ITransportRequestCodeLookup>()
                .GetCodesAsync(jobs.Where(j => j.TransportRequestId is not null).Select(j => j.TransportRequestId!.Value).Distinct().ToList(), stoppingToken);
            var fleet = sp.GetRequiredService<IFleetModule>();
            foreach (var job in jobs)
            {
                var robotId = job.Assignments.LastOrDefault(a => a.EndedAt is null)?.RobotId;
                var robotCode = robotId is { } id ? (await fleet.GetRobotAsync(id, stoppingToken))?.Code : null;
                var payload = JsonSerializer.SerializeToElement(new
                {
                    hostStartedAt = startedAt,
                    jobNo = job.JobNo,
                    jobStatus = job.Status,
                    robotCode
                }, EvidenceOutboxWriter.Json);
                await outbox.WriteAsync(new EvidenceEnvelope(Guid.NewGuid(), EvidenceEnvelope.CurrentSchemaVersion,
                    EvidenceEventTypes.HostStarted, startedAt, EvidenceEnvelope.CoreSource, job.TransportRequestId,
                    codes.GetValueOrDefault(job.TransportRequestId!.Value), job.JobId, job.JobNo, null, robotId, robotCode,
                    null, job.Status, payload), stoppingToken);
            }

            logger.LogWarning("Evidence: Host started with {Count} unfinished trip(s); recorded in their journals", jobs.Count);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Evidence: could not record the Host start");
        }
    }
}

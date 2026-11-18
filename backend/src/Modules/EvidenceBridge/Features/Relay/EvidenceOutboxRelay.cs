using System.Net.Http.Json;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.EvidenceBridge.Entities;
using WaroTrans.EvidenceBridge.Persistence;
using WaroTrans.EvidenceBridge.Services;

namespace WaroTrans.EvidenceBridge.Features.Relay;

/// <summary>
/// Delivers the outbox to the Evidence Recorder at least once, oldest first. Rows are claimed with
/// <c>FOR UPDATE SKIP LOCKED</c>, so two Hosts never send the same batch at the same time. A Recorder that is down only
/// delays delivery (exponential backoff, capped); nothing undelivered is ever deleted.
/// </summary>
internal sealed class EvidenceOutboxRelay(
    IServiceScopeFactory scopes,
    IHttpClientFactory http,
    IOptions<EvidenceBridgeOptions> options,
    TimeProvider clock,
    ILogger<EvidenceOutboxRelay> logger) : BackgroundService
{
    public const string HttpClientName = "evidence-recorder";
    public const string IngestPath = "api/evidence/integrations/transport-events";

    private DateTimeOffset _nextCleanup = DateTimeOffset.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            var sent = 0;
            try
            {
                sent = await RelayOnceAsync(stoppingToken);
                await CleanupAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Evidence relay pass failed");
            }

            // A full batch means more is waiting: go again at once.
            if (sent < options.Value.BatchSize)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(Math.Max(100, options.Value.PollIntervalMs)), clock, stoppingToken);
            }
        }
    }

    /// <returns>How many rows were claimed.</returns>
    internal async Task<int> RelayOnceAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EvidenceBridgeDbContext>();
        var now = clock.GetUtcNow();
        var batch = Math.Clamp(options.Value.BatchSize, 1, 500);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var rows = await db.OutboxMessages
            .FromSqlInterpolated($"""
                SELECT * FROM evidence_bridge.outbox_messages
                WHERE published_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= {now})
                ORDER BY created_at
                LIMIT {batch}
                FOR UPDATE SKIP LOCKED
                """)
            .ToListAsync(cancellationToken);
        if (rows.Count == 0)
        {
            await transaction.CommitAsync(cancellationToken);
            return 0;
        }

        try
        {
            var result = await SendAsync(rows, cancellationToken);
            var rejected = result.Rejected?.ToDictionary(r => r.EventId, r => r.Reason) ?? [];
            foreach (var row in rows)
            {
                row.AttemptCount++;
                row.PublishedAt = now;
                row.NextAttemptAt = null;
                // Refused for good (bad shape): kept for inspection, never sent again.
                row.LastError = rejected.TryGetValue(row.Id, out var reason) ? Truncate($"rejected: {reason}") : null;
            }

            if (rejected.Count > 0)
            {
                logger.LogWarning("Evidence Recorder refused {Count} event(s): {Reasons}", rejected.Count,
                    string.Join("; ", rejected.Values.Distinct().Take(5)));
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            foreach (var row in rows)
            {
                row.AttemptCount++;
                row.NextAttemptAt = now.AddSeconds(Backoff(row.AttemptCount));
                row.LastError = Truncate(ex.Message);
            }

            logger.LogWarning("Evidence Recorder unreachable ({Error}); {Count} event(s) wait", ex.Message, rows.Count);
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return rows.Count;
    }

    private async Task<IngestResult> SendAsync(IReadOnlyList<OutboxMessage> rows, CancellationToken cancellationToken)
    {
        // The rows already hold the serialized envelopes: send them as they are.
        var body = new StringBuilder("{\"events\":[");
        for (var i = 0; i < rows.Count; i++)
        {
            body.Append(i == 0 ? "" : ",").Append(rows[i].Payload);
        }

        body.Append("]}");
        using var request = new HttpRequestMessage(HttpMethod.Post, IngestPath)
        {
            Content = new StringContent(body.ToString(), Encoding.UTF8, "application/json")
        };
        request.Headers.Add(ServiceTokenEndpointFilter.HeaderName, options.Value.ServiceToken);
        using var response = await http.CreateClient(HttpClientName).SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Recorder answered {(int)response.StatusCode}");
        }

        return await response.Content.ReadFromJsonAsync<IngestResult>(cancellationToken) ?? new IngestResult(0, []);
    }

    private async Task CleanupAsync(CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        if (now < _nextCleanup)
        {
            return;
        }

        _nextCleanup = now.AddHours(1);
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EvidenceBridgeDbContext>();
        var before = now.AddDays(-Math.Max(1, options.Value.PublishedRetentionDays));
        await db.OutboxMessages.Where(m => m.PublishedAt != null && m.PublishedAt < before).ExecuteDeleteAsync(cancellationToken);
    }

    private double Backoff(int attempts) =>
        Math.Min(Math.Pow(2, Math.Min(attempts, 16)), Math.Max(1, options.Value.MaxBackoffSeconds));

    private static string Truncate(string text) => text.Length <= 2000 ? text : text[..2000];

    internal sealed record IngestResult(int Accepted, IReadOnlyList<RejectedEvent>? Rejected);

    internal sealed record RejectedEvent(Guid EventId, string Reason);
}

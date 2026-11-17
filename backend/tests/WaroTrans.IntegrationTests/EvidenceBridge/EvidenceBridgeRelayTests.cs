using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.EvidenceBridge.Contracts;
using WaroTrans.EvidenceBridge.Features.Relay;
using WaroTrans.EvidenceBridge.Persistence;
using WaroTrans.EvidenceBridge.Services;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.EvidenceBridge;

/// <summary>
/// The outbox to the Evidence Recorder: an event the monolith publishes is stored, delivered at least once, kept and
/// retried while the Recorder is down, and never sent again once the Recorder refused it for good.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class EvidenceBridgeRelayTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    private const string Token = "evidence-bridge-integration-test-token-0123456789";

    private EvidenceBridgeOptions Options => Factory.Services.GetRequiredService<IOptions<EvidenceBridgeOptions>>().Value;

    private async Task<(Guid EventId, string RobotCode)> PublishOfflineAsync()
    {
        var robotCode = "RBT-EV-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        var e = new RobotConnectivityChanged(Guid.NewGuid(), robotCode, false, RobotStatus.OFFLINE, DateTimeOffset.UtcNow);
        Options.Enabled = true;
        try
        {
            await Factory.Services.GetRequiredService<IIntegrationEventPublisher>().PublishAsync(e);
        }
        finally
        {
            Options.Enabled = false;
        }

        return (e.EventId, robotCode);
    }

    private EvidenceOutboxRelay Relay(FakeRecorder recorder) =>
        new(Factory.Services.GetRequiredService<IServiceScopeFactory>(), recorder,
            Microsoft.Extensions.Options.Options.Create(new EvidenceBridgeOptions { Enabled = true, ServiceToken = Token, BatchSize = 50 }),
            TimeProvider.System, NullLogger<EvidenceOutboxRelay>.Instance);

    private async Task<WaroTrans.EvidenceBridge.Entities.OutboxMessage> RowAsync(Guid id)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<EvidenceBridgeDbContext>().OutboxMessages.AsNoTracking().SingleAsync(m => m.Id == id);
    }

    [Fact]
    public async Task A_published_event_is_stored_and_delivered_with_the_service_token()
    {
        var (eventId, robotCode) = await PublishOfflineAsync();
        var stored = await RowAsync(eventId);
        Assert.Equal(EvidenceEventTypes.RobotConnectivityChanged, stored.EventType);
        Assert.Null(stored.PublishedAt);

        var recorder = new FakeRecorder(HttpStatusCode.OK, """{"accepted":1,"rejected":[]}""");
        await Relay(recorder).RelayOnceAsync(CancellationToken.None);

        var sent = Assert.Single(recorder.Bodies);
        var envelope = JsonDocument.Parse(sent).RootElement.GetProperty("events")[0];
        Assert.Equal(eventId, envelope.GetProperty("eventId").GetGuid());
        Assert.Equal(robotCode, envelope.GetProperty("robotCode").GetString());
        Assert.Equal("OFFLINE", envelope.GetProperty("sourceStatusCode").GetString());
        Assert.Equal(Token, recorder.Tokens.Single());
        Assert.NotNull((await RowAsync(eventId)).PublishedAt);

        // Delivered rows are not sent again.
        await Relay(recorder).RelayOnceAsync(CancellationToken.None);
        Assert.Single(recorder.Bodies);
    }

    [Fact]
    public async Task While_the_recorder_is_down_the_event_waits_and_is_retried_later()
    {
        var (eventId, _) = await PublishOfflineAsync();

        await Relay(new FakeRecorder(HttpStatusCode.ServiceUnavailable, "{}")).RelayOnceAsync(CancellationToken.None);

        var row = await RowAsync(eventId);
        Assert.Null(row.PublishedAt);
        Assert.Equal(1, row.AttemptCount);
        Assert.True(row.NextAttemptAt > DateTimeOffset.UtcNow);
        Assert.Contains("503", row.LastError);

        // Not due yet: nothing is sent.
        var recorder = new FakeRecorder(HttpStatusCode.OK, """{"accepted":1,"rejected":[]}""");
        await Relay(recorder).RelayOnceAsync(CancellationToken.None);
        Assert.Empty(recorder.Bodies);
    }

    [Fact]
    public async Task An_event_the_recorder_refuses_for_good_is_kept_with_the_reason_and_not_resent()
    {
        var (eventId, _) = await PublishOfflineAsync();

        var recorder = new FakeRecorder(HttpStatusCode.OK, $$"""{"accepted":0,"rejected":[{"eventId":"{{eventId}}","reason":"robot_code_missing"}]}""");
        await Relay(recorder).RelayOnceAsync(CancellationToken.None);

        var row = await RowAsync(eventId);
        Assert.NotNull(row.PublishedAt);
        Assert.Equal("rejected: robot_code_missing", row.LastError);
    }

    [Fact]
    public async Task Evidence_switched_off_captures_nothing()
    {
        var e = new RobotConnectivityChanged(Guid.NewGuid(), "RBT-OFF", false, RobotStatus.OFFLINE, DateTimeOffset.UtcNow);
        await Factory.Services.GetRequiredService<IIntegrationEventPublisher>().PublishAsync(e);

        await using var scope = Factory.Services.CreateAsyncScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<EvidenceBridgeDbContext>().OutboxMessages.AnyAsync(m => m.Id == e.EventId));
    }

    [Fact]
    public async Task The_reconciliation_api_needs_the_service_token()
    {
        var url = $"/api/evidence-bridge/transport-requests/{Guid.NewGuid()}/runs";
        Options.Enabled = true;
        Options.ServiceToken = Token;
        try
        {
            using var anonymous = CreateAnonymousClient();
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(url)).StatusCode);

            anonymous.DefaultRequestHeaders.Add(ServiceTokenEndpointFilter.HeaderName, Token);
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(url)).StatusCode);
        }
        finally
        {
            Options.Enabled = false;
            Options.ServiceToken = string.Empty;
        }
    }

    private sealed class FakeRecorder(HttpStatusCode status, string body) : IHttpClientFactory
    {
        public List<string> Bodies { get; } = [];
        public List<string> Tokens { get; } = [];
        private HttpStatusCode Status { get; } = status;
        private string Body { get; } = body;

        public HttpClient CreateClient(string name) =>
            new(new Handler(this)) { BaseAddress = new Uri("http://recorder.test/") };

        private sealed class Handler(FakeRecorder owner) : HttpMessageHandler
        {
            protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            {
                owner.Bodies.Add(await request.Content!.ReadAsStringAsync(cancellationToken));
                owner.Tokens.Add(request.Headers.GetValues(ServiceTokenEndpointFilter.HeaderName).Single());
                return new HttpResponseMessage(owner.Status) { Content = new StringContent(owner.Body, Encoding.UTF8, "application/json") };
            }
        }
    }
}

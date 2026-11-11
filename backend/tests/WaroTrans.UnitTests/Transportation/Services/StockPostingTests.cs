using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.IntegrationEventHandlers;
using WaroTrans.Transportation.Persistence;
using WaroTrans.Transportation.Services;
using WaroTrans.UnitTests.Transportation.Infrastructure;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.UnitTests.Transportation.Services;

/// <summary>WH-01: what Warehouse has to post survives a failure and arrives once, pickup before delivery.</summary>
public sealed class StockPostingTests
{
    private readonly string _dbName = $"postings-{Guid.NewGuid()}";
    private readonly RecordingRecorder _recorder = new();
    private readonly RecordingIssues _issues = new();
    private readonly Guid _job = Guid.NewGuid();
    private readonly Guid _container = Guid.NewGuid();
    private readonly Guid _shelf = Guid.NewGuid();
    private Guid _request;

    private TransportationDbContext Db() => TransportationTestDbContextFactory.Create(_dbName);

    private StockPostingProcessor Processor(TransportationDbContext db) =>
        new(db, _recorder, NullLogger<StockPostingProcessor>.Instance, _issues);

    private async Task SeedAsync()
    {
        await using var db = Db();
        var now = DateTimeOffset.UtcNow;
        var request = new TransportRequest
        {
            Id = Guid.NewGuid(),
            RequestCode = "TR-1",
            Status = TransportRequestStatus.QUEUED,
            CreatedAt = now,
            UpdatedAt = now
        };
        request.Details.Add(new TransportRequestDetail
        {
            Id = Guid.NewGuid(),
            TransportRequestId = request.Id,
            SequenceNo = 1,
            ContainerId = _container,
            DestinationStorageLocationId = _shelf,
            DestinationLevelNo = 2,
            Status = TransportRequestDetailStatus.QUEUED,
            CreatedAt = now,
            UpdatedAt = now
        });
        db.TransportRequests.Add(request);
        await db.SaveChangesAsync();
        _request = request.Id;
    }

    private async Task HandleAsync(string status)
    {
        await using var db = Db();
        var handler = new JobContainerStatusChangedHandler(
            db,
            Processor(db),
            new NoEvents(),
            NullLogger<JobContainerStatusChangedHandler>.Instance);
        await handler.HandleAsync(new JobContainerStatusChanged(_job, _request, _container, status));
    }

    [Fact]
    public async Task Assigned_moves_no_stock_but_onboard_does_even_though_both_are_in_progress()
    {
        await SeedAsync();

        await HandleAsync("ASSIGNED");
        Assert.Empty(_recorder.Calls);

        await HandleAsync("ONBOARD");
        Assert.Equal(["PICKUP"], _recorder.Calls);
        Assert.True(await Db().StockPostings.AllAsync(p => p.PostedAt != null));
    }

    [Fact]
    public async Task A_repeated_handover_event_posts_once()
    {
        await SeedAsync();

        await HandleAsync("ONBOARD");
        await HandleAsync("ONBOARD");
        await HandleAsync("DELIVERED");
        await HandleAsync("DELIVERED");

        Assert.Equal(["PICKUP", "DELIVERY"], _recorder.Calls);
        Assert.Equal(2, await Db().StockPostings.CountAsync());
        Assert.Equal(_shelf, _recorder.LastDelivery!.DestinationStorageLocationId);
        Assert.Equal((short)2, _recorder.LastDelivery.DestinationLevelNo);
    }

    [Fact]
    public async Task A_failed_post_keeps_the_detail_and_is_retried_until_it_lands()
    {
        await SeedAsync();
        _recorder.FailNext = 1;

        await HandleAsync("DELIVERED");

        await using (var db = Db())
        {
            var detail = await db.TransportRequestDetails.SingleAsync();
            Assert.Equal(TransportRequestDetailStatus.COMPLETED, detail.Status);
            var posting = await db.StockPostings.SingleAsync();
            Assert.Null(posting.PostedAt);
            Assert.Equal(1, posting.Attempts);
            Assert.NotNull(posting.LastError);
        }

        await using (var db = Db())
        {
            Assert.Equal(0, await Processor(db).DrainAsync(DateTimeOffset.UtcNow));
        }

        await using (var db = Db())
        {
            Assert.Equal(1, await Processor(db).DrainAsync(DateTimeOffset.UtcNow.AddMinutes(10)));
        }

        Assert.True(await Db().StockPostings.AllAsync(p => p.PostedAt != null));
        Assert.Equal(["DELIVERY"], _recorder.Calls);
    }

    [Fact]
    public async Task A_delivery_waits_for_its_pickup_that_failed()
    {
        await SeedAsync();
        _recorder.FailNext = 1;

        await HandleAsync("ONBOARD");
        await HandleAsync("DELIVERED");
        Assert.Empty(_recorder.Calls);

        await using var db = Db();
        Assert.Equal(2, await Processor(db).DrainAsync(DateTimeOffset.UtcNow.AddMinutes(10)));
        Assert.Equal(["PICKUP", "DELIVERY"], _recorder.Calls);
    }

    [Fact]
    public async Task Someone_is_told_once_after_repeated_failures()
    {
        await SeedAsync();
        _recorder.FailNext = int.MaxValue;
        await HandleAsync("DELIVERED");

        var at = DateTimeOffset.UtcNow;
        for (var i = 0; i < StockPostingProcessor.AttemptsBeforeIssue + 2; i++)
        {
            at = at.AddMinutes(10);
            await using var db = Db();
            await Processor(db).DrainAsync(at);
        }

        var draft = Assert.Single(_issues.Drafts);
        Assert.Equal(_container, draft.ContainerId);
        Assert.Equal(_request, draft.TransportRequestId);
    }

    private sealed class RecordingRecorder : IContainerMovementRecorder
    {
        public List<string> Calls { get; } = [];
        public ContainerDelivery? LastDelivery { get; private set; }
        public int FailNext { get; set; }

        public Task RecordPickedUpAsync(ContainerPickup pickup, CancellationToken cancellationToken = default)
        {
            ThrowIfFailing();
            Calls.Add("PICKUP");
            return Task.CompletedTask;
        }

        public Task RecordDeliveredAsync(ContainerDelivery delivery, CancellationToken cancellationToken = default)
        {
            ThrowIfFailing();
            Calls.Add("DELIVERY");
            LastDelivery = delivery;
            return Task.CompletedTask;
        }

        private void ThrowIfFailing()
        {
            if (FailNext > 0)
            {
                FailNext--;
                throw new InvalidOperationException("warehouse down");
            }
        }
    }

    private sealed class RecordingIssues : IIssueReporter
    {
        public List<SystemIssueDraft> Drafts { get; } = [];

        public Task<Guid> ReportFromStepAsync(StepIssueDraft draft, CancellationToken cancellationToken = default) =>
            Task.FromResult(Guid.NewGuid());

        public Task<Guid> ReportAsync(SystemIssueDraft draft, CancellationToken cancellationToken = default)
        {
            Drafts.Add(draft);
            return Task.FromResult(Guid.NewGuid());
        }
    }

    private sealed class NoEvents : IIntegrationEventPublisher
    {
        public Task PublishAsync<TEvent>(TEvent integrationEvent, CancellationToken cancellationToken = default)
            where TEvent : IIntegrationEvent => Task.CompletedTask;
    }
}

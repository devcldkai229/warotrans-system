using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Features.QueueTransportRequest;
using WaroTrans.UnitTests.Transportation.Infrastructure;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Planning;

namespace WaroTrans.UnitTests.Transportation.Features.QueueTransportRequest;

public sealed class QueueTransportRequestHandlerTests
{
    private readonly string _dbName = $"transportation-queue-{Guid.NewGuid()}";
    private readonly RecordingJobRuntimeProvisioner _provisioner = new();

    private static readonly Guid A = Guid.NewGuid();
    private static readonly Guid D = Guid.NewGuid();
    private static readonly Guid E = Guid.NewGuid();

    private QueueTransportRequestHandler CreateHandler() =>
        new(
            TransportationTestDbContextFactory.Create(_dbName),
            new CollectThenDeliverJobBatchPlanner(),
            _provisioner,
            NullLogger<QueueTransportRequestHandler>.Instance);

    private async Task<TransportRequest> SeedAsync(TransportRequestStatus status = TransportRequestStatus.SUBMITTED)
    {
        var request = TransportRequest.Submit(
            "REQ-20261013-000001",
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            null,
            null,
            [
                new TransportRequestDetailDraft(1, Guid.NewGuid(), null, A, null, null, D, null),
                new TransportRequestDetailDraft(2, Guid.NewGuid(), null, A, null, null, E, null)
            ],
            DateTimeOffset.UtcNow);
        request.Status = status;

        await using var db = TransportationTestDbContextFactory.Create(_dbName);
        db.TransportRequests.Add(request);
        await db.SaveChangesAsync();
        return request;
    }

    private TransportRequest Load(Guid id) =>
        TransportationTestDbContextFactory.Create(_dbName).TransportRequests
            .Include(r => r.Details)
            .Single(r => r.Id == id);

    [Fact]
    public async Task Queue_plans_provisions_and_moves_request_and_details_to_queued()
    {
        var request = await SeedAsync();

        var response = await CreateHandler().HandleAsync(request.Id);

        Assert.Equal("QUEUED", response.Status);
        Assert.NotNull(response.QueuedAt);
        var job = Assert.Single(response.Jobs);
        Assert.Equal("BATCH-001", job.BatchKey);
        Assert.Equal(2, job.JobContainerCount);

        var persisted = Load(request.Id);
        Assert.Equal(TransportRequestStatus.QUEUED, persisted.Status);
        Assert.NotNull(persisted.QueuedAt);
        Assert.All(persisted.Details, d => Assert.Equal(TransportRequestDetailStatus.QUEUED, d.Status));
    }

    [Fact]
    public async Task Queue_sends_snapshot_of_persisted_details_and_planned_stops_to_provisioner()
    {
        var request = await SeedAsync();

        await CreateHandler().HandleAsync(request.Id);

        var (snapshot, batches) = Assert.Single(_provisioner.Calls);
        Assert.Equal(request.Id, snapshot.TransportRequestId);
        Assert.Equal(
            request.Details.OrderBy(d => d.SequenceNo).Select(d => d.Id),
            snapshot.Details.Select(d => d.DetailId));
        var batch = Assert.Single(batches);
        Assert.Equal(
            [(JobStopAction.PICKUP, A), (JobStopAction.DROPOFF, D), (JobStopAction.DROPOFF, E)],
            batch.Stops.Select(s => (s.Action, s.EndpointId)));
    }

    [Fact]
    public async Task Queue_again_returns_same_jobs_and_keeps_queued_state()
    {
        var request = await SeedAsync();
        var first = await CreateHandler().HandleAsync(request.Id);

        var second = await CreateHandler().HandleAsync(request.Id);

        Assert.Equal(first.Jobs.Single().JobId, second.Jobs.Single().JobId);
        Assert.Equal(first.QueuedAt, second.QueuedAt);
        Assert.Equal("QUEUED", second.Status);
    }

    [Fact]
    public async Task Queue_unknown_request_returns_not_found()
    {
        var ex = await Assert.ThrowsAsync<NotFoundException>(() => CreateHandler().HandleAsync(Guid.NewGuid()));

        Assert.Equal("transport_request_not_found", ex.Code);
    }

    [Fact]
    public async Task Queue_cancelled_request_is_rejected()
    {
        var request = await SeedAsync(TransportRequestStatus.CANCELLED);

        var ex = await Assert.ThrowsAsync<ConflictException>(() => CreateHandler().HandleAsync(request.Id));

        Assert.Equal("transport_request_not_queueable", ex.Code);
        Assert.Empty(_provisioner.Calls);
    }

    [Fact]
    public async Task Provisioning_failure_leaves_request_submitted()
    {
        var request = await SeedAsync();
        _provisioner.ExceptionToThrow = new DomainValidationException("not published", "workflow_not_published");

        await Assert.ThrowsAsync<DomainValidationException>(() => CreateHandler().HandleAsync(request.Id));

        var persisted = Load(request.Id);
        Assert.Equal(TransportRequestStatus.SUBMITTED, persisted.Status);
        Assert.Null(persisted.QueuedAt);
        Assert.All(persisted.Details, d => Assert.Equal(TransportRequestDetailStatus.PENDING, d.Status));
    }

    /// <summary>
    /// Mimics provisioner idempotency: one Job per (TransportRequestId, BatchKey).
    /// </summary>
    private sealed class RecordingJobRuntimeProvisioner : IJobRuntimeProvisioner
    {
        private readonly Dictionary<string, Guid> _jobs = [];

        public List<(TransportRequestExecutionSnapshot Snapshot, IReadOnlyList<JobBatchPlan> Batches)> Calls { get; } = [];
        public Exception? ExceptionToThrow { get; set; }

        public Task<ProvisionJobRuntimeResult> ProvisionAsync(
            TransportRequestExecutionSnapshot request,
            IReadOnlyList<JobBatchPlan> batches,
            CancellationToken cancellationToken = default)
        {
            if (ExceptionToThrow is not null)
            {
                return Task.FromException<ProvisionJobRuntimeResult>(ExceptionToThrow);
            }

            Calls.Add((request, batches));
            var jobs = batches
                .Select(b =>
                {
                    var key = $"{request.TransportRequestId:N}:{b.BatchKey}";
                    if (!_jobs.TryGetValue(key, out var jobId))
                    {
                        jobId = Guid.NewGuid();
                        _jobs[key] = jobId;
                    }

                    return new ProvisionedJobSummary(jobId, "JOB-TEST", b.BatchKey, b.ContainerIds.Count, 0, 0);
                })
                .ToList();

            return Task.FromResult(new ProvisionJobRuntimeResult(request.TransportRequestId, jobs));
        }
    }
}

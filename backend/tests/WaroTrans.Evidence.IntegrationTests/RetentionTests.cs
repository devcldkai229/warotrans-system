using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.IntegrationTests.Infrastructure;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder.Features.Journals.Retention;

namespace WaroTrans.Evidence.IntegrationTests;

[Collection(RecorderCollection.Name)]
public sealed class RetentionTests(RecorderFactory factory) : IAsyncLifetime
{
    public Task InitializeAsync() => factory.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    private static (EvidenceJournal Journal, RobotRunEvidence Run) Seed(EvidenceDbContext db, EvidenceJournalStatus status, DateTimeOffset ended, DateTimeOffset? hold)
    {
        var journal = new EvidenceJournal
        {
            Id = Guid.NewGuid(), TransportRequestId = Guid.NewGuid(), RequestCode = $"REQ-20250101-{Random.Shared.Next(100000, 999999)}",
            Status = status, RequestedContainerCount = 1, FirstStartedAtUtc = ended.AddMinutes(-10), LastEndedAtUtc = ended,
            RetentionHoldUntilUtc = hold, CreatedAtUtc = ended, UpdatedAtUtc = ended,
        };
        var run = new RobotRunEvidence
        {
            Id = Guid.NewGuid(), JournalId = journal.Id, RunCorrelationKey = RobotRunEvidence.KeyFor(Guid.NewGuid()), RobotId = "RBT-002",
            CreatedAtUtc = ended, UpdatedAtUtc = ended,
        };
        db.Journals.Add(journal);
        db.Runs.Add(run);
        db.TrajectoryPoints.Add(new TrajectoryPoint
        {
            RobotRunEvidenceId = run.Id, SequenceNumber = 1, CapturedAtUtc = ended, X = 1, Y = 2, PoseSource = "tf", IsValid = true, ReceivedAtUtc = ended,
        });
        db.Events.Add(new EvidenceEvent
        {
            Id = Guid.NewGuid(), JournalId = journal.Id, RobotRunEvidenceId = run.Id, SourceSystem = "robot", SourceEventId = Guid.NewGuid().ToString(),
            Category = EvidenceEventCategory.NAVIGATION, EventType = "GOAL", Severity = EvidenceSeverity.INFO, OccurredAtUtc = ended, ReceivedAtUtc = ended,
        });
        return (journal, run);
    }

    [Fact]
    public async Task Old_closed_telemetry_goes_but_held_open_and_recent_journals_keep_theirs()
    {
        var now = DateTimeOffset.UtcNow;
        Guid expired, held, recent, open;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvidenceDbContext>();
            expired = Seed(db, EvidenceJournalStatus.FINALIZED, now.AddDays(-200), null).Journal.Id;
            held = Seed(db, EvidenceJournalStatus.PARTIAL, now.AddDays(-200), now.AddDays(30)).Journal.Id;
            recent = Seed(db, EvidenceJournalStatus.FINALIZED, now.AddDays(-5), null).Journal.Id;
            open = Seed(db, EvidenceJournalStatus.OPEN, now.AddDays(-200), null).Journal.Id;
            await db.SaveChangesAsync();
        }

        var retention = factory.Services.GetServices<IHostedService>().OfType<EvidenceRetentionService>().Single();
        Assert.Equal(1, await retention.RunOnceAsync(CancellationToken.None));

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvidenceDbContext>();
            async Task<int> Telemetry(Guid journal) =>
                await db.Events.CountAsync(e => e.JournalId == journal)
                + await db.TrajectoryPoints.CountAsync(p => db.Runs.Any(r => r.Id == p.RobotRunEvidenceId && r.JournalId == journal));
            Assert.Equal(0, await Telemetry(expired));
            Assert.Equal(2, await Telemetry(held));
            Assert.Equal(2, await Telemetry(recent));
            Assert.Equal(2, await Telemetry(open));
            Assert.True(await db.Journals.AnyAsync(j => j.Id == expired));
            Assert.Equal(1, await db.Runs.CountAsync(r => r.JournalId == expired));
        }
    }
}

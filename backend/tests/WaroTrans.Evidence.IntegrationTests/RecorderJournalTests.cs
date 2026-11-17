using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using WaroTrans.Evidence.Contracts;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.IntegrationTests.Infrastructure;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder.Features.Admin.IssueRobotCredential;
using WaroTrans.Evidence.Recorder.Features.Journals.GetJournal;
using WaroTrans.Evidence.Recorder.Features.Journals.ReconcileWithTransport;

namespace WaroTrans.Evidence.IntegrationTests;

[Collection(RecorderCollection.Name)]
public sealed class RecorderJournalTests(RecorderFactory factory) : IAsyncLifetime
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly DateTimeOffset T0 = new(2026, 11, 17, 3, 0, 0, TimeSpan.Zero);
    private readonly Guid _request = Guid.NewGuid();
    private readonly Guid _robot1 = Guid.NewGuid();
    private readonly Guid _robot2 = Guid.NewGuid();

    public Task InitializeAsync() => factory.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    private TransportEventEnvelope Assignment(
        Guid assignment, Guid job, string jobNo, Guid robotId, string robotCode, string phase, DateTimeOffset at,
        IReadOnlyList<Guid> containers, string startReason = "START", DateTimeOffset? ended = null, string? endReason = null,
        string requestStatus = "IN_PROGRESS") =>
        new(Guid.NewGuid(), 1, TransportEventTypes.JobRobotAssignmentChanged, at, "warotrans-core", _request, "REQ-20261117-000042",
            job, jobNo, null, robotId, robotCode, assignment, phase,
            JsonSerializer.SerializeToElement(new
            {
                assignmentId = assignment, jobId = job, jobNo, robotId, phase, startReason,
                startedAt = phase == "OPENED" ? at : (ended ?? at).AddMinutes(-5),
                endedAt = ended, endReason, containerIds = containers, mapVersionCode = "MAP-ONE-V014",
                jobStatus = "RUNNING", requestContainerCount = 5, transportRequestStatus = requestStatus
            }, Json));

    private TransportEventEnvelope RequestProgress(string status, DateTimeOffset at, int total = 5, int completed = 0) =>
        new(Guid.NewGuid(), 1, TransportEventTypes.TransportRequestProgressed, at, "warotrans-core", _request, "REQ-20261117-000042",
            null, null, null, null, null, null, status,
            JsonSerializer.SerializeToElement(new { requestId = _request, status, totalDetails = total, completedDetails = completed, failedDetails = 0 }, Json));

    private static TransportEventEnvelope RobotEvent(string type, string robotCode, string status, DateTimeOffset at, object payload) =>
        new(Guid.NewGuid(), 1, type, at, "warotrans-core", null, null, null, null, null, Guid.NewGuid(), robotCode, null, status,
            JsonSerializer.SerializeToElement(payload, Json));

    private async Task<TransportEventBatchResult> PushAsync(params TransportEventEnvelope[] events)
    {
        using var client = factory.ServiceClient();
        var response = await client.PostAsJsonAsync("/api/evidence/integrations/transport-events", new TransportEventBatch(events), Json);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TransportEventBatchResult>(Json))!;
    }

    private async Task<T> WithDbAsync<T>(Func<EvidenceDbContext, Task<T>> read)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await read(scope.ServiceProvider.GetRequiredService<EvidenceDbContext>());
    }

    [Fact]
    public async Task Without_the_service_token_nothing_is_taken_in()
    {
        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/evidence/integrations/transport-events",
            new TransportEventBatch([RequestProgress("IN_PROGRESS", T0)]), Json);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, await WithDbAsync(db => db.Journals.CountAsync()));
    }

    [Fact]
    public async Task The_same_event_twice_makes_one_journal_one_run_one_event()
    {
        var opened = Assignment(Guid.NewGuid(), Guid.NewGuid(), "JOB-1", _robot1, "RBT-001", "OPENED", T0, [Guid.NewGuid()]);

        Assert.Equal(1, (await PushAsync(opened)).Accepted);
        var again = await PushAsync(opened, opened);
        Assert.Equal(2, again.Accepted); // taken, not applied again
        Assert.Empty(again.Rejected);

        Assert.Equal(1, await WithDbAsync(db => db.Journals.CountAsync()));
        Assert.Equal(1, await WithDbAsync(db => db.Runs.CountAsync()));
        Assert.Equal(1, await WithDbAsync(db => db.Events.CountAsync()));
    }

    [Fact]
    public async Task Five_containers_on_two_robots_are_one_journal_with_two_runs_of_three_and_two()
    {
        var trip1 = Enumerable.Range(0, 3).Select(_ => Guid.NewGuid()).ToList();
        var trip2 = Enumerable.Range(0, 2).Select(_ => Guid.NewGuid()).ToList();
        var result = await PushAsync(
            RequestProgress("IN_PROGRESS", T0),
            Assignment(Guid.NewGuid(), Guid.NewGuid(), "JOB-1", _robot1, "RBT-001", "OPENED", T0, trip1),
            Assignment(Guid.NewGuid(), Guid.NewGuid(), "JOB-2", _robot2, "RBT-002", "OPENED", T0.AddSeconds(40), trip2));
        Assert.Equal(3, result.Accepted);
        Assert.Empty(result.Rejected);

        using var admin = factory.UserClient("ADMIN");
        var journal = await admin.GetFromJsonAsync<JournalDetailResponse>($"/api/evidence/journals/by-transport-request/{_request}", Json);
        Assert.NotNull(journal);
        Assert.Equal("REQ-20261117-000042", journal.RequestCode);
        Assert.Equal(5, journal.RequestedContainerCount);
        Assert.Equal("IN_PROGRESS", journal.SourceTransportStatus);
        Assert.Equal(nameof(EvidenceJournalStatus.OPEN), journal.EvidenceStatus);
        Assert.Equal(T0, journal.FirstStartedAtUtc);
        Assert.Collection(journal.Runs,
            r => { Assert.Equal("RBT-001", r.RobotCode); Assert.Equal(3, r.AssignedContainerCount); Assert.Equal("MAP-ONE-V014", r.MapVersion); },
            r => { Assert.Equal("RBT-002", r.RobotCode); Assert.Equal(2, r.AssignedContainerCount); });
    }

    [Fact]
    public async Task A_trip_handed_to_another_robot_keeps_the_first_run_and_opens_a_new_one()
    {
        var job = Guid.NewGuid();
        var first = Guid.NewGuid();
        var containers = new List<Guid> { Guid.NewGuid() };
        await PushAsync(
            Assignment(first, job, "JOB-1", _robot1, "RBT-001", "OPENED", T0, containers),
            Assignment(first, job, "JOB-1", _robot1, "RBT-001", "CLOSED", T0.AddMinutes(3), containers, ended: T0.AddMinutes(3), endReason: "REASSIGNED"),
            Assignment(Guid.NewGuid(), job, "JOB-1", _robot2, "RBT-002", "OPENED", T0.AddMinutes(3), containers, startReason: "REASSIGN"));

        var runs = await WithDbAsync(db => db.Runs.OrderBy(r => r.StartedAtUtc).ThenBy(r => r.RobotId).ToListAsync());
        Assert.Equal(2, runs.Count);
        Assert.Equal("RBT-001", runs[0].RobotId);
        Assert.Equal(T0.AddMinutes(3), runs[0].EndedAtUtc);
        Assert.Equal("REASSIGNED", runs[0].TransportRunStatusSnapshot);
        Assert.Equal("RBT-002", runs[1].RobotId);
        Assert.Equal("REASSIGN", runs[1].StartReason);
        Assert.Null(runs[1].EndedAtUtc);
        Assert.All(runs, r => Assert.Equal(job, r.SourceJobId));
    }

    [Fact]
    public async Task An_assignment_closed_before_it_opened_still_makes_one_complete_run()
    {
        var assignment = Guid.NewGuid();
        var job = Guid.NewGuid();
        await PushAsync(Assignment(assignment, job, "JOB-1", _robot1, "RBT-001", "CLOSED", T0.AddMinutes(9), [Guid.NewGuid()], ended: T0.AddMinutes(9), endReason: "COMPLETED"));
        await PushAsync(Assignment(assignment, job, "JOB-1", _robot1, "RBT-001", "OPENED", T0, [Guid.NewGuid()]));

        var run = Assert.Single(await WithDbAsync(db => db.Runs.ToListAsync()));
        Assert.Equal(T0, run.StartedAtUtc);
        Assert.Equal(T0.AddMinutes(9), run.EndedAtUtc);
        Assert.Equal("COMPLETED", run.TransportRunStatusSnapshot);
    }

    [Fact]
    public async Task A_robot_event_is_filed_under_that_robots_open_run_and_dropped_when_it_has_none()
    {
        await PushAsync(Assignment(Guid.NewGuid(), Guid.NewGuid(), "JOB-1", _robot1, "RBT-001", "OPENED", T0, [Guid.NewGuid()]));

        var result = await PushAsync(
            RobotEvent(TransportEventTypes.TrafficWaitChanged, "RBT-001", "DeadlockRisk", T0.AddMinutes(1), new { blockingOwnerCode = "RBT-002", x = 1.0, y = 2.0 }),
            RobotEvent(TransportEventTypes.RobotErrorReported, "RBT-009", "E_STOP", T0.AddMinutes(1), new { }));
        Assert.Equal(2, result.Accepted);

        var events = await WithDbAsync(db => db.Events.Where(e => e.EventType != TransportEventTypes.JobRobotAssignmentChanged).ToListAsync());
        var traffic = Assert.Single(events);
        Assert.Equal(EvidenceEventCategory.TRAFFIC, traffic.Category);
        Assert.Equal(EvidenceSeverity.WARNING, traffic.Severity);
        Assert.NotNull(traffic.RobotRunEvidenceId);
        Assert.Equal(1.0, traffic.X);
        // The unknown robot's event was taken (not resent forever) but filed nowhere.
        Assert.Equal(2, await WithDbAsync(db => db.Inbox.CountAsync(i => i.EventType != TransportEventTypes.JobRobotAssignmentChanged)));
    }

    [Fact]
    public async Task A_bad_event_is_refused_without_blocking_the_rest_of_the_batch()
    {
        var bad = RequestProgress("IN_PROGRESS", T0) with { EventType = "job.teleported" };
        var result = await PushAsync(bad, RequestProgress("IN_PROGRESS", T0));

        Assert.Equal(1, result.Accepted);
        var refused = Assert.Single(result.Rejected);
        Assert.Equal(bad.EventId, refused.EventId);
    }

    [Fact]
    public async Task Evidence_status_follows_the_evidence_not_the_delivery()
    {
        var assignment = Guid.NewGuid();
        var job = Guid.NewGuid();
        await PushAsync(
            Assignment(assignment, job, "JOB-1", _robot1, "RBT-001", "OPENED", T0, [Guid.NewGuid()]),
            Assignment(assignment, job, "JOB-1", _robot1, "RBT-001", "CLOSED", T0.AddMinutes(2), [Guid.NewGuid()], ended: T0.AddMinutes(2), endReason: "COMPLETED", requestStatus: "COMPLETED"),
            RequestProgress("COMPLETED", T0.AddMinutes(2), total: 1, completed: 1));

        // Delivered, but no video ever arrived and the grace period (15 min) is long over: missing evidence.
        var journal = await WithDbAsync(db => db.Journals.SingleAsync());
        Assert.Equal("COMPLETED", journal.TransportStatusSnapshot);
        Assert.Equal(EvidenceJournalStatus.PARTIAL, journal.Status);
        Assert.Equal(EvidenceRunStatus.CAPTURE_FAILED, (await WithDbAsync(db => db.Runs.SingleAsync())).Status);
    }

    [Fact]
    public async Task Reading_a_journal_needs_the_permission_and_a_technician_sees_only_their_robots()
    {
        await PushAsync(Assignment(Guid.NewGuid(), Guid.NewGuid(), "JOB-1", _robot1, "RBT-001", "OPENED", T0, [Guid.NewGuid()]));
        var url = $"/api/evidence/journals/by-transport-request/{_request}";

        using (var staff = factory.UserClient("STAFF"))
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync(url)).StatusCode);
        }

        using (var anonymous = factory.CreateClient())
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(url)).StatusCode);
        }

        var technician = Guid.NewGuid();
        factory.Core.Answer("/api/identity/me/capabilities", new
        {
            accountId = technician, role = "TECHNICIAN", permissions = Array.Empty<string>(),
            robotScope = new { allRobots = false, robotIds = new[] { _robot2 } }
        });
        using (var outOfScope = factory.UserClient("TECHNICIAN", technician))
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await outOfScope.GetAsync(url)).StatusCode);
        }

        var other = Guid.NewGuid();
        factory.Core.Answer("/api/identity/me/capabilities", new
        {
            accountId = other, role = "TECHNICIAN", permissions = Array.Empty<string>(),
            robotScope = new { allRobots = false, robotIds = new[] { _robot1 } }
        });
        using (var inScope = factory.UserClient("TECHNICIAN", other))
        {
            Assert.Equal(HttpStatusCode.OK, (await inScope.GetAsync(url)).StatusCode);
        }

        var audits = await WithDbAsync(db => db.AccessAudits.Select(a => a.Result).ToListAsync());
        Assert.Contains(AccessResult.DENIED, audits);
        Assert.Contains(AccessResult.ALLOWED, audits);
    }

    [Fact]
    public async Task A_robot_credential_works_once_issued_and_stops_when_replaced()
    {
        using var admin = factory.UserClient("ADMIN");
        var first = await (await admin.PostAsync("/api/evidence/admin/robots/RBT-002/credentials", null))
            .Content.ReadFromJsonAsync<RobotCredentialResponse>(Json);
        Assert.NotNull(first);

        using var robot = factory.CreateClient();
        robot.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", first.AuthorizationHeader);
        Assert.Equal(HttpStatusCode.OK, (await robot.GetAsync("/api/evidence/edge/whoami")).StatusCode);

        using (var technician = factory.UserClient("TECHNICIAN"))
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await technician.PostAsync("/api/evidence/admin/robots/RBT-002/credentials", null)).StatusCode);
        }

        using (var impostor = factory.CreateClient())
        {
            // The token only works for the robot it was issued to.
            impostor.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", first.AuthorizationHeader.Replace("RBT-002", "RBT-001"));
            Assert.Equal(HttpStatusCode.Unauthorized, (await impostor.GetAsync("/api/evidence/edge/whoami")).StatusCode);
        }

        await admin.PostAsync("/api/evidence/admin/robots/RBT-002/credentials", null);
        // A revoked token stops within the credential cache time; drop the cache instead of waiting for it.
        ((MemoryCache)factory.Services.GetRequiredService<IMemoryCache>()).Compact(1.0);
        Assert.Equal(HttpStatusCode.Unauthorized, (await robot.GetAsync("/api/evidence/edge/whoami")).StatusCode);
        Assert.Equal(1, await WithDbAsync(db => db.RobotCredentials.CountAsync(c => c.RobotCode == "RBT-002" && c.RevokedAtUtc == null)));
        Assert.DoesNotContain(first.Token, await WithDbAsync(db => db.RobotCredentials.Select(c => c.TokenSha256).ToListAsync()));
    }

    [Fact]
    public async Task Reconciliation_adds_a_run_whose_event_never_arrived()
    {
        await PushAsync(RequestProgress("IN_PROGRESS", T0));
        var assignment = Guid.NewGuid();
        factory.Core.Answer($"/api/evidence-bridge/transport-requests/{_request}/runs", new SourceRequestRuns(
            _request, "REQ-20261117-000042", "IN_PROGRESS",
            [
                new SourceTripRuns(Guid.NewGuid(), "JOB-7", "RUNNING", Guid.NewGuid(), "MAP-ONE-V014", [Guid.NewGuid(), Guid.NewGuid()],
                    [new SourceAssignment(assignment, _robot2, "RBT-002", "START", T0.AddMinutes(1), null, null)])
            ]));

        var maintenance = factory.Services.GetServices<IHostedService>().OfType<JournalMaintenanceService>().Single();
        await maintenance.RunOnceAsync(CancellationToken.None);

        var run = Assert.Single(await WithDbAsync(db => db.Runs.ToListAsync()));
        Assert.Equal($"jra:{assignment:D}", run.RunCorrelationKey);
        Assert.Equal("RBT-002", run.RobotId);
        Assert.Equal(2, run.AssignedContainerIds.Count);
        Assert.Equal("RUNNING", run.TransportRunStatusSnapshot);
        Assert.NotNull((await WithDbAsync(db => db.Journals.SingleAsync())).LastReconciledAtUtc);
    }
}

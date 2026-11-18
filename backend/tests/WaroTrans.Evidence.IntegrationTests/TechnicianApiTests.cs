using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using WaroTrans.Evidence.Contracts;
using WaroTrans.Evidence.IntegrationTests.Infrastructure;
using WaroTrans.Evidence.Recorder.Features.Admin.IssueRobotCredential;
using WaroTrans.Evidence.Recorder.Features.Edge;
using WaroTrans.Evidence.Recorder.Features.Journals.Technician;

namespace WaroTrans.Evidence.IntegrationTests;

/// <summary>The Technician's journal API: search within scope, replay manifest, path with gaps, plans, events, notes, audit, export.</summary>
[Collection(RecorderCollection.Name)]
public sealed class TechnicianApiTests(RecorderFactory factory) : IAsyncLifetime
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly DateTimeOffset _t0 = DateTimeOffset.UtcNow.AddMinutes(-20);
    private readonly Guid _robot1 = Guid.NewGuid();
    private readonly Guid _robot2 = Guid.NewGuid();
    private Guid _request1;
    private Guid _request2;

    public async Task InitializeAsync()
    {
        await factory.ResetAsync();
        _request1 = await OpenRunAsync("REQ-TECH-0001", "RBT-001", _robot1);
        _request2 = await OpenRunAsync("REQ-TECH-0002", "RBT-002", _robot2);
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<Guid> OpenRunAsync(string code, string robot, Guid robotId)
    {
        var request = Guid.NewGuid();
        using var service = factory.ServiceClient();
        var events = new List<TransportEventEnvelope>
        {
            new(Guid.NewGuid(), 1, TransportEventTypes.JobRobotAssignmentChanged, _t0, "warotrans-core", request, code, Guid.NewGuid(), "JOB-" + code,
                null, robotId, robot, Guid.NewGuid(), "OPENED",
                JsonSerializer.SerializeToElement(new { startedAt = _t0, startReason = "START", containerIds = new[] { Guid.NewGuid() }, mapVersionId = Guid.NewGuid(), mapVersionCode = "MAP-ONE-V014" }, Json)),
            new(Guid.NewGuid(), 1, TransportEventTypes.JobStepStatusChanged, _t0.AddSeconds(30), "warotrans-core", request, code, null, "JOB-" + code,
                Guid.NewGuid(), null, null, null, "FAILED", JsonSerializer.SerializeToElement(new { stepKey = "move_to_pickup", errorCode = "NAVIGATION_BLOCKED" }, Json))
        };
        (await service.PostAsJsonAsync("/api/evidence/integrations/transport-events", new TransportEventBatch(events), Json)).EnsureSuccessStatusCode();
        return request;
    }

    private void TechnicianScope(params Guid[] robots) =>
        factory.Core.Answer("/api/identity/me/capabilities", new
        {
            accountId = Guid.NewGuid(), role = "TECHNICIAN", permissions = Array.Empty<string>(),
            robotScope = new { allRobots = false, robotIds = robots }
        });

    private async Task<Guid> JournalIdAsync(HttpClient client, Guid request) =>
        (await client.GetFromJsonAsync<JsonElement>($"/api/evidence/journals/by-transport-request/{request}", Json)).GetProperty("id").GetGuid();

    [Fact]
    public async Task Search_lists_only_journals_with_a_robot_in_the_callers_scope_and_counts_incidents()
    {
        using var admin = factory.UserClient("ADMIN");
        var all = await admin.GetFromJsonAsync<PagedJournals>("/api/evidence/journals", Json);
        Assert.Equal(2, all!.Total);
        var first = Assert.Single(all.Items, i => i.RequestCode == "REQ-TECH-0001");
        Assert.Equal(["RBT-001"], first.Robots);
        Assert.Equal(1, first.IncidentsBySeverity["ERROR"]);
        Assert.Equal("MISSING", first.VideoAvailability);

        Assert.Single((await admin.GetFromJsonAsync<PagedJournals>("/api/evidence/journals?search=tech-0002", Json))!.Items);
        Assert.Single((await admin.GetFromJsonAsync<PagedJournals>("/api/evidence/journals?robot=RBT-001", Json))!.Items);
        Assert.Equal(2, (await admin.GetFromJsonAsync<PagedJournals>("/api/evidence/journals?severity=ERROR", Json))!.Total);

        TechnicianScope(_robot2);
        using var technician = factory.UserClient("TECHNICIAN");
        var scoped = await technician.GetFromJsonAsync<PagedJournals>("/api/evidence/journals", Json);
        Assert.Equal("REQ-TECH-0002", Assert.Single(scoped!.Items).RequestCode);
    }

    [Fact]
    public async Task The_replay_manifest_carries_runs_cameras_and_the_time_range_and_a_path_keeps_its_gaps()
    {
        using var admin = factory.UserClient("ADMIN");
        var journalId = await JournalIdAsync(admin, _request1);

        // RBT-001 reports its path: a lost localization in the middle.
        var cred = await (await admin.PostAsync("/api/evidence/admin/robots/RBT-001/credentials", null)).Content.ReadFromJsonAsync<RobotCredentialResponse>(Json);
        using var robot = factory.CreateClient();
        robot.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", cred!.AuthorizationHeader);
        var run = (await robot.GetFromJsonAsync<ActiveRunResponse>("/api/evidence/edge/active-run", Json))!;
        var points = Enumerable.Range(0, 300).Select(i => new TrajectorySample(i, _t0.AddMilliseconds(200 * i), i * 0.01, 0, 0, 0.3, 0,
            "tf", "map", null, i is < 140 or > 150, "MAP-ONE-V014")).ToList();
        (await robot.PostAsJsonAsync($"/api/evidence/edge/runs/{run.RunId}/trajectory", new TrajectoryBatchRequest(points), Json)).EnsureSuccessStatusCode();
        await robot.PostAsJsonAsync($"/api/evidence/edge/runs/{run.RunId}/plans", new PlanSnapshotsRequest(
            [new PlanSnapshot(1, "nav2", _t0, "map", "MAP-ONE-V014", [[0, 0], [3, 0]], "h", "initial")]), Json);

        var replay = await admin.GetFromJsonAsync<ReplayManifest>($"/api/evidence/journals/{journalId}/replay", Json);
        var replayRun = Assert.Single(replay!.Runs);
        Assert.Equal("RBT-001", replayRun.RobotCode);
        Assert.True(replayRun.TrajectoryAvailable);
        Assert.Equal(1, replayRun.PlanCount);
        Assert.NotNull(replayRun.MapVersionId);
        Assert.Equal(_t0.ToUnixTimeSeconds(), replay.FromUtc.ToUnixTimeSeconds());

        var path = await admin.GetFromJsonAsync<TrajectoryResponse>($"/api/evidence/runs/{run.RunId}/trajectory?maxPoints=30", Json);
        Assert.Equal(300, path!.Total);
        Assert.True(path.Downsampled);
        Assert.True(path.Points.Count < 100);
        Assert.Equal(11, path.Points.Count(p => p[4] == 0)); // every invalid sample survives the downsampling

        var plans = await admin.GetFromJsonAsync<List<PlanResponse>>($"/api/evidence/runs/{run.RunId}/plans", Json);
        Assert.Equal(2, Assert.Single(plans!).PathPoints.GetArrayLength());

        var errors = await admin.GetFromJsonAsync<List<EventResponse>>($"/api/evidence/journals/{journalId}/events?severity=ERROR", Json);
        Assert.Contains("NAVIGATION_BLOCKED", Assert.Single(errors!).Message);

        TechnicianScope(_robot2);
        using var other = factory.UserClient("TECHNICIAN");
        Assert.Equal(HttpStatusCode.Forbidden, (await other.GetAsync($"/api/evidence/journals/{journalId}/replay")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.GetAsync($"/api/evidence/runs/{run.RunId}/trajectory")).StatusCode);
    }

    [Fact]
    public async Task Notes_belong_to_their_author_and_every_change_is_audited()
    {
        TechnicianScope(_robot1);
        var author = Guid.NewGuid();
        using var technician = factory.UserClient("TECHNICIAN", author);
        var journalId = await JournalIdAsync(technician, _request1);
        var created = await technician.PostAsJsonAsync($"/api/evidence/journals/{journalId}/annotations",
            new AnnotationRequest(_t0.AddSeconds(31), null, "ROOT_CAUSE", "Robot blocked by a pallet left on lane A"), Json);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var note = (await created.Content.ReadFromJsonAsync<AnnotationResponse>(Json))!;

        Assert.Equal(HttpStatusCode.BadRequest, (await technician.PostAsJsonAsync($"/api/evidence/journals/{journalId}/annotations",
            new AnnotationRequest(_t0, null, "GOSSIP", "x"), Json)).StatusCode);
        using (var staff = factory.UserClient("STAFF"))
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsJsonAsync($"/api/evidence/journals/{journalId}/annotations",
                new AnnotationRequest(_t0, null, "NOTE", "x"), Json)).StatusCode);
        }

        using (var someoneElse = factory.UserClient("TECHNICIAN"))
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await someoneElse.PutAsJsonAsync($"/api/evidence/journals/{journalId}/annotations/{note.Id}",
                new AnnotationRequest(_t0, null, "NOTE", "rewritten"), Json)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.OK, (await technician.PutAsJsonAsync($"/api/evidence/journals/{journalId}/annotations/{note.Id}",
            new AnnotationRequest(_t0.AddSeconds(31), null, "ROOT_CAUSE", "Pallet on lane A; robot waited, then Nav2 aborted"), Json)).StatusCode);
        using var admin = factory.UserClient("ADMIN");
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/evidence/journals/{journalId}/annotations/{note.Id}")).StatusCode);
        Assert.Empty((await admin.GetFromJsonAsync<List<AnnotationResponse>>($"/api/evidence/journals/{journalId}/annotations", Json))!);

        Assert.Equal(HttpStatusCode.Forbidden, (await technician.GetAsync($"/api/evidence/journals/{journalId}/audit")).StatusCode);
        var audit = await admin.GetFromJsonAsync<List<AuditResponse>>($"/api/evidence/journals/{journalId}/audit", Json);
        Assert.Equal(3, audit!.Count(a => a.Action == "ANNOTATE"));
    }

    [Fact]
    public async Task An_export_is_a_manifest_of_the_originals_with_their_hashes_and_is_audited()
    {
        using var admin = factory.UserClient("ADMIN");
        var journalId = await JournalIdAsync(admin, _request2);
        var response = await admin.PostAsync($"/api/evidence/journals/{journalId}/export", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType!.MediaType);
        var packet = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("REQ-TECH-0002", packet.GetProperty("journal").GetProperty("requestCode").GetString());
        Assert.Equal(1, packet.GetProperty("runs").GetArrayLength());
        Assert.True(packet.TryGetProperty("originalSegments", out _));
        var audit = await admin.GetFromJsonAsync<List<AuditResponse>>($"/api/evidence/journals/{journalId}/audit", Json);
        Assert.Contains(audit!, a => a.Action == "EXPORT");

        using var staff = factory.UserClient("STAFF");
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsync($"/api/evidence/journals/{journalId}/export", null)).StatusCode);
    }
}

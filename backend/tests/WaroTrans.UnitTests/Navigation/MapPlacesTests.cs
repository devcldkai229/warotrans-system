using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.PublishMapVersion;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.Services;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.UnitTests.Navigation;

/// <summary>
/// A workflow names a place by the id it was configured with; on another map version the place with the same code is
/// meant. Publishing asks every module first (IMapPublishGuard) and lets them follow afterwards (IMapPublishFollower).
/// </summary>
public class MapPlacesTests
{
    private static NavigationDbContext Db() =>
        new(new DbContextOptionsBuilder<NavigationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static readonly Guid Warehouse = Guid.NewGuid();

    private static MapVersion Map(NavigationDbContext db, MapStatus status, string code)
    {
        var map = new MapVersion
        {
            Id = Guid.NewGuid(), WarehouseId = Warehouse, Code = code, VersionNo = 1, Name = code, Status = status,
            MapUri = "/map-assets/map.pgm", FrameId = "map", Resolution = 0.05, CreatedAt = DateTimeOffset.UtcNow,
            PublishedAt = status == MapStatus.PUBLISHED ? DateTimeOffset.UtcNow : null
        };
        db.MapVersions.Add(map);
        return map;
    }

    private static Endpoint Endpoint(NavigationDbContext db, MapVersion map, string code, Guid? source = null)
    {
        var e = new Endpoint
        {
            Id = Guid.NewGuid(), MapVersionId = map.Id, Code = code, Name = code, EndpointType = EndpointType.WAYPOINT,
            X = 1, Y = 2, Yaw = 0, PositionTolerance = 0.1, YawTolerance = 0.1, IsEnabled = true, SourceEndpointId = source
        };
        db.Endpoints.Add(e);
        return e;
    }

    private static EndpointGroup Group(NavigationDbContext db, MapVersion map, string code)
    {
        var g = new EndpointGroup { Id = Guid.NewGuid(), MapVersionId = map.Id, Code = code, Name = code, IsActive = true };
        db.EndpointGroups.Add(g);
        return g;
    }

    [Fact]
    public async Task A_place_resolves_on_another_map_by_its_code()
    {
        using var db = Db();
        var old = Map(db, MapStatus.PUBLISHED, "MAP-V1");
        var next = Map(db, MapStatus.DRAFT, "MAP-V2");
        var inbound = Endpoint(db, old, "EP-INBOUND");
        var gone = Endpoint(db, old, "EP-QUEUE-B");
        var inboundNew = Endpoint(db, next, "EP-INBOUND");
        var parkingOld = Group(db, old, "PARKING");
        var parkingNew = Group(db, next, "PARKING");
        await db.SaveChangesAsync();
        var api = new NavigationModuleApi(db);

        var resolved = (await api.ResolvePlacesOnMapAsync([inbound.Id, gone.Id, inboundNew.Id, parkingOld.Id, Guid.NewGuid()], next.Id))
            .ToDictionary(r => r.SourceId);

        Assert.Equal(inboundNew.Id, resolved[inbound.Id].TargetId);
        Assert.Equal(inboundNew.Id, resolved[inboundNew.Id].TargetId); // already on that map
        Assert.False(resolved[gone.Id].Found);
        Assert.Equal("EP-QUEUE-B", resolved[gone.Id].Code);
        Assert.True(resolved[parkingOld.Id].IsGroup);
        Assert.Equal(parkingNew.Id, resolved[parkingOld.Id].TargetId);
        Assert.Equal(4, resolved.Count); // an unknown id is left out
        Assert.Null(await api.ResolvePlaceOnMapAsync(Guid.NewGuid(), next.Id));
    }

    // ------------------------------------------------------------------ publish check

    private sealed class Guard(params MapPublishIssue[] issues) : IMapPublishGuard
    {
        public MapPublishContext? Seen { get; private set; }

        public Task<IReadOnlyList<MapPublishIssue>> CheckAsync(MapPublishContext context, CancellationToken cancellationToken = default)
        {
            Seen = context;
            return Task.FromResult<IReadOnlyList<MapPublishIssue>>(issues);
        }
    }

    private sealed class Follower : IMapPublishFollower
    {
        public List<MapPublishContext> Calls { get; } = [];

        public Task OnPublishedAsync(MapPublishContext context, CancellationToken cancellationToken = default)
        {
            Calls.Add(context);
            return Task.CompletedTask;
        }
    }

    private sealed class NoOpRebinder : IStorageLocationEndpointRebinder
    {
        public Task<int> RebindAsync(Guid warehouseId, IReadOnlyDictionary<Guid, Guid> endpointMap, CancellationToken cancellationToken = default) =>
            Task.FromResult(0);
    }

    private static (PublishMapVersionHandler Publish, MapPublishCheck Check) Publisher(NavigationDbContext db, IMapPublishGuard guard, IMapPublishFollower follower)
    {
        var check = new MapPublishCheck(db, [guard], [follower], NullLogger<MapPublishCheck>.Instance);
        var publish = new PublishMapVersionHandler(db, new NoOpRebinder(), new EndpointStorage(db, new NoStorageLocations()),
            NullLogger<PublishMapVersionHandler>.Instance, check);
        return (publish, check);
    }

    [Fact]
    public async Task Running_jobs_refuse_the_publish_even_when_forced()
    {
        using var db = Db();
        var old = Map(db, MapStatus.PUBLISHED, "MAP-V1");
        var next = Map(db, MapStatus.DRAFT, "MAP-V2");
        await db.SaveChangesAsync();
        var guard = new Guard(new MapPublishIssue(MapPublishSeverity.Block, "jobs_running", "2 Job(s) are running.", Overridable: false));
        var (publish, check) = Publisher(db, guard, new Follower());

        var report = await check.CheckAsync(next.Id, default);
        Assert.False(report.CanPublish);
        Assert.False(report.CanOverride);
        Assert.Equal(["MAP-V1"], report.ReplacedMapCodes);
        Assert.Equal([old.Id], guard.Seen!.ReplacedMapVersionIds);

        var error = await Assert.ThrowsAsync<ConflictException>(() => publish.HandleAsync(next.Id, default, force: true, reason: "need it now"));
        Assert.Equal("map_publish_blocked", error.Code);
        Assert.Equal(MapStatus.DRAFT, (await db.MapVersions.FindAsync(next.Id))!.Status);
    }

    [Fact]
    public async Task A_missing_place_needs_an_override_with_a_reason_then_followers_run()
    {
        using var db = Db();
        var old = Map(db, MapStatus.PUBLISHED, "MAP-V1");
        var next = Map(db, MapStatus.DRAFT, "MAP-V2");
        await db.SaveChangesAsync();
        var guard = new Guard(
            new MapPublishIssue(MapPublishSeverity.Block, "workflow_place_missing", "Workflow INBOUND needs EP-INBOUND."),
            new MapPublishIssue(MapPublishSeverity.Warn, "robots_on_old_map", "RBT-001 stays on the current map."));
        var follower = new Follower();
        var (publish, check) = Publisher(db, guard, follower);

        var report = await check.CheckAsync(next.Id, default);
        Assert.True(report.CanOverride);
        Assert.Equal(MapPublishSeverity.Block, report.Issues[0].Severity); // blocks first

        var needs = await Assert.ThrowsAsync<ConflictException>(() => publish.HandleAsync(next.Id));
        Assert.Equal("map_publish_needs_confirmation", needs.Code);
        var reason = await Assert.ThrowsAsync<DomainValidationException>(() => publish.HandleAsync(next.Id, default, force: true, reason: " "));
        Assert.Equal("map_publish_reason_required", reason.Code);
        Assert.Empty(follower.Calls);

        await publish.HandleAsync(next.Id, default, force: true, reason: "EP-INBOUND moves next week");

        Assert.Equal(MapStatus.PUBLISHED, (await db.MapVersions.FindAsync(next.Id))!.Status);
        Assert.Equal(MapStatus.ARCHIVED, (await db.MapVersions.FindAsync(old.Id))!.Status);
        var call = Assert.Single(follower.Calls);
        Assert.Equal(next.Id, call.NewMapVersionId);
        Assert.Equal([old.Id], call.ReplacedMapVersionIds);
    }

    [Fact]
    public async Task Warnings_only_publish_without_asking()
    {
        using var db = Db();
        Map(db, MapStatus.PUBLISHED, "MAP-V1");
        var next = Map(db, MapStatus.DRAFT, "MAP-V2");
        await db.SaveChangesAsync();
        var follower = new Follower();
        var (publish, _) = Publisher(db, new Guard(new MapPublishIssue(MapPublishSeverity.Warn, "robots_on_old_map", "x")), follower);

        await publish.HandleAsync(next.Id);
        Assert.Single(follower.Calls);
    }
}

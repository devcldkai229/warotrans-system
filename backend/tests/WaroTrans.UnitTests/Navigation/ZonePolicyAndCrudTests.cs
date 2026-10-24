using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.CreateZone;
using WaroTrans.Navigation.Features.UpdateZone;
using WaroTrans.Navigation.Geometry;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.UnitTests.Navigation;

public class ZonePolicyAndCrudTests
{
    private sealed class FakeCodeGenerator : IBusinessCodeGenerator
    {
        public Task<string> NextZoneCodeAsync(string suffix, CancellationToken cancellationToken = default) =>
            Task.FromResult($"ZONE-{suffix.ToUpperInvariant().Replace(' ', '-')}");

        public Task<string> NextWarehouseCodeAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextCategoryCodeAsync(string suffix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextSkuCodeAsync(string prefix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextMapVersionCodeAsync(string warehouseCode, int versionNo, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextEndpointCodeAsync(string suffix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextEdgeCodeAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextRobotCodeAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextContainerCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextRequestCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextJobCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private static NavigationDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<NavigationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new NavigationDbContext(options);
    }

    private static MapVersion AddMap(NavigationDbContext db, MapStatus status = MapStatus.DRAFT)
    {
        var map = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = Guid.NewGuid(),
            Code = $"MAP-{Guid.NewGuid():N}"[..18],
            VersionNo = 1,
            Name = "Map",
            Status = status,
            MapUri = "/map.pgm",
            FrameId = "map",
            Resolution = 0.05,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.MapVersions.Add(map);
        return map;
    }

    private static JsonElement ClosedSquare() =>
        JsonSerializer.SerializeToElement(new
        {
            type = "Polygon",
            coordinates = new[]
            {
                new[] { new[] { 0.0, 0.0 }, new[] { 4.0, 0.0 }, new[] { 4.0, 3.0 }, new[] { 0.0, 3.0 }, new[] { 0.0, 0.0 } }
            }
        });

    [Fact]
    public void SingleOccupancy_RequiresCapacityOne()
    {
        Assert.Throws<DomainValidationException>(() =>
            ZonePolicyValidator.Validate(ZoneType.SINGLE_OCCUPANCY, 2, 0.5, null, 1));

        ZonePolicyValidator.Validate(ZoneType.SINGLE_OCCUPANCY, 1, null, null, 1);
        ZonePolicyValidator.Validate(ZoneType.SINGLE_OCCUPANCY, 1, 0.4, null, 1);
    }

    [Fact]
    public void Junction_RequiresCapacityOne()
    {
        Assert.Throws<DomainValidationException>(() =>
            ZonePolicyValidator.Validate(ZoneType.JUNCTION, 2, null, null, 1));

        ZonePolicyValidator.Validate(ZoneType.JUNCTION, 1, null, null, 1);
        ZonePolicyValidator.Validate(ZoneType.JUNCTION, 1, 0.5, null, 1);
    }

    [Fact]
    public void Speed_RequiresMaxSpeed()
    {
        Assert.Throws<DomainValidationException>(() =>
            ZonePolicyValidator.Validate(ZoneType.SPEED, 3, null, null, 1));

        ZonePolicyValidator.Validate(ZoneType.SPEED, 3, 0.8, null, 1);
    }

    [Fact]
    public void KeepOut_AndNoStop_AcceptEmptyPolicy()
    {
        ZonePolicyValidator.Validate(ZoneType.KEEP_OUT, 1, null, null, 1);
        ZonePolicyValidator.Validate(ZoneType.NO_STOP, 2, null, null, 1);
    }

    [Fact]
    public async Task CreateZone_PersistsOnDraft_AndRejectsPublished()
    {
        using var db = CreateDb();
        var draft = AddMap(db);
        var published = AddMap(db, MapStatus.PUBLISHED);
        await db.SaveChangesAsync();

        var handler = new CreateZoneHandler(db, new FakeCodeGenerator(), new CreateZoneValidator());
        var created = await handler.HandleAsync(draft.Id, new CreateZoneRequest(
            "Dock gate",
            "KEEP_OUT",
            ClosedSquare(),
            1,
            null,
            true));

        Assert.Equal("ZONE-DOCK-GATE", created.Code);
        Assert.Equal("Polygon", created.Geometry.GetProperty("type").GetString());

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(published.Id, new CreateZoneRequest(
                "No",
                "KEEP_OUT",
                ClosedSquare(),
                1,
                null,
                true)));
        Assert.Equal("map_version_not_draft", ex.Code);
    }

    [Fact]
    public async Task UpdateZone_RejectsWhenPublished()
    {
        using var db = CreateDb();
        var map = AddMap(db, MapStatus.PUBLISHED);
        var zone = new Zone
        {
            Id = Guid.NewGuid(),
            MapVersionId = map.Id,
            Code = "ZONE-A",
            Name = "A",
            ZoneType = ZoneType.KEEP_OUT,
            Geometry = GeoJsonGeometry.NormalizePolygon(ClosedSquare()),
            Capacity = 1,
            IsActive = true,
            PolicySchemaVersion = 1
        };
        db.Zones.Add(zone);
        await db.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            new UpdateZoneHandler(db, new UpdateZoneValidator()).HandleAsync(zone.Id, new UpdateZoneRequest(
                "B",
                "KEEP_OUT",
                ClosedSquare(),
                1,
                null,
                true)));
        Assert.Equal("map_version_not_draft", ex.Code);
    }
}

using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.ArchiveMapVersion;
using WaroTrans.Navigation.Features.CreateMapVersion;
using WaroTrans.Navigation.Features.GetActiveMapVersion;
using WaroTrans.Navigation.Features.PublishMapVersion;
using WaroTrans.Navigation.Features.UpdateMapVersion;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.UnitTests.Navigation;

public class MapVersionTests
{
    private sealed class FakeWarehouseModule(WarehouseSnapshot? warehouse = null) : IWarehouseModule
    {
        public WarehouseSnapshot? Warehouse { get; set; } = warehouse;

        public Task<WarehouseSnapshot?> GetWarehouseAsync(Guid warehouseId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Warehouse is null || Warehouse.Id != warehouseId ? null : Warehouse);

        public Task<IReadOnlyList<ContainerSnapshot>> GetContainersAsync(
            IReadOnlyCollection<Guid> containerIds,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<ContainerSnapshot>>([]);

        public Task<IReadOnlyList<StorageLocationSnapshot>> GetStorageLocationsAsync(
            IReadOnlyCollection<Guid> storageLocationIds,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<StorageLocationSnapshot>>([]);
    }

    private sealed class FakeCodeGenerator : IBusinessCodeGenerator
    {
        public Task<string> NextMapVersionCodeAsync(string warehouseCode, int versionNo, CancellationToken cancellationToken = default) =>
            Task.FromResult($"MAP-{warehouseCode}-V{versionNo:000}");

        public Task<string> NextWarehouseCodeAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextCategoryCodeAsync(string suffix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextSkuCodeAsync(string prefix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextEndpointCodeAsync(string suffix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextEdgeCodeAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextZoneCodeAsync(string suffix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextRobotCodeAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextContainerCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextRequestCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextJobCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private static NavigationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<NavigationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new NavigationDbContext(options);
    }

    private static MapVersion SeedMap(
        NavigationDbContext db,
        Guid warehouseId,
        MapStatus status,
        int versionNo = 1,
        string? code = null)
    {
        var map = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouseId,
            Code = code ?? $"MAP-WH-V{versionNo:000}-{Guid.NewGuid():N}"[..24],
            VersionNo = versionNo,
            Name = $"Map {versionNo}",
            Status = status,
            MapUri = "/map-assets/map.pgm",
            FrameId = "map",
            Resolution = 0.05,
            CreatedAt = DateTimeOffset.UtcNow,
            PublishedAt = status == MapStatus.PUBLISHED ? DateTimeOffset.UtcNow : null
        };
        db.MapVersions.Add(map);
        return map;
    }

    [Fact]
    public async Task CreateMapVersion_IncrementsVersionNo_AndSetsDraftStatus_WithGeneratedCode()
    {
        using var dbContext = CreateDbContext();
        var warehouseId = Guid.NewGuid();
        var warehouses = new FakeWarehouseModule(new WarehouseSnapshot(warehouseId, "WH01", true));
        var handler = new CreateMapVersionHandler(
            dbContext, warehouses, new FakeCodeGenerator(), new CreateMapVersionValidator());

        var res1 = await handler.HandleAsync(warehouseId, new CreateMapVersionRequest("Map V1", "/map.pgm", 0.05, 0, 0, 0));
        Assert.Equal(1, res1.VersionNo);
        Assert.Equal("DRAFT", res1.Status);
        Assert.Equal("MAP-WH01-V001", res1.Code);
        Assert.Null(res1.PublishedAt);

        var res2 = await handler.HandleAsync(warehouseId, new CreateMapVersionRequest("Map V2", "/map.pgm", 0.05, 0, 0, 0));
        Assert.Equal(2, res2.VersionNo);
        Assert.Equal("MAP-WH01-V002", res2.Code);
    }

    [Fact]
    public async Task CreateMapVersion_ThrowsNotFound_WhenWarehouseMissing()
    {
        using var dbContext = CreateDbContext();
        var handler = new CreateMapVersionHandler(
            dbContext, new FakeWarehouseModule(), new FakeCodeGenerator(), new CreateMapVersionValidator());

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(Guid.NewGuid(), new CreateMapVersionRequest("Map", "/map.pgm", 0.05, 0, 0, 0)));

        Assert.Equal("warehouse_not_found", ex.Code);
    }

    [Fact]
    public async Task CreateMapVersion_ThrowsValidationException_WhenResolutionNonPositive()
    {
        using var dbContext = CreateDbContext();
        var warehouseId = Guid.NewGuid();
        var handler = new CreateMapVersionHandler(
            dbContext,
            new FakeWarehouseModule(new WarehouseSnapshot(warehouseId, "WH01", true)),
            new FakeCodeGenerator(),
            new CreateMapVersionValidator());

        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            handler.HandleAsync(warehouseId, new CreateMapVersionRequest("Invalid", "/map.pgm", 0, 0, 0, 0)));
    }

    [Fact]
    public async Task UpdateMapVersion_Succeeds_WhenDraft()
    {
        using var dbContext = CreateDbContext();
        var map = SeedMap(dbContext, Guid.NewGuid(), MapStatus.DRAFT);
        map.Name = "Initial Draft";
        map.MapUri = "/initial.pgm";
        await dbContext.SaveChangesAsync();

        var handler = new UpdateMapVersionHandler(dbContext, new UpdateMapVersionValidator());
        var response = await handler.HandleAsync(
            map.Id,
            new UpdateMapVersionRequest("Updated Name", "/updated.pgm", 0.1, 10, 20, 1.57));

        Assert.Equal("Updated Name", response.Name);
        Assert.Equal("/updated.pgm", response.MapUri);
        Assert.Equal(0.1, response.Resolution);
        Assert.Equal(10, response.OriginX);
    }

    [Fact]
    public async Task UpdateMapVersion_Throws_WhenNotDraft()
    {
        using var dbContext = CreateDbContext();
        var map = SeedMap(dbContext, Guid.NewGuid(), MapStatus.PUBLISHED);
        await dbContext.SaveChangesAsync();

        var handler = new UpdateMapVersionHandler(dbContext, new UpdateMapVersionValidator());

        await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(map.Id, new UpdateMapVersionRequest("New Name", "/new.pgm", 0.05, 0, 0, 0)));
    }

    [Fact]
    public async Task PublishMapVersion_ArchivesExistingActiveMap_AndSetsPublished()
    {
        using var dbContext = CreateDbContext();
        var warehouseId = Guid.NewGuid();
        var map1 = SeedMap(dbContext, warehouseId, MapStatus.PUBLISHED, 1, "MAP-A");
        var map2 = SeedMap(dbContext, warehouseId, MapStatus.DRAFT, 2, "MAP-B");
        await dbContext.SaveChangesAsync();

        var response = await new PublishMapVersionHandler(dbContext).HandleAsync(map2.Id);

        Assert.Equal("PUBLISHED", response.Status);
        Assert.NotNull(response.PublishedAt);
        Assert.Equal(MapStatus.ARCHIVED, (await dbContext.MapVersions.FindAsync(map1.Id))!.Status);
    }

    [Fact]
    public async Task PublishMapVersion_Throws_WhenAlreadyPublishedOrArchived()
    {
        using var dbContext = CreateDbContext();
        var map = SeedMap(dbContext, Guid.NewGuid(), MapStatus.ARCHIVED);
        await dbContext.SaveChangesAsync();

        await Assert.ThrowsAsync<DomainValidationException>(() =>
            new PublishMapVersionHandler(dbContext).HandleAsync(map.Id));
    }

    [Fact]
    public async Task ArchiveMapVersion_TransitionsStatusToArchived()
    {
        using var dbContext = CreateDbContext();
        var map = SeedMap(dbContext, Guid.NewGuid(), MapStatus.DRAFT);
        await dbContext.SaveChangesAsync();

        var response = await new ArchiveMapVersionHandler(dbContext).HandleAsync(map.Id);
        Assert.Equal("ARCHIVED", response.Status);
    }

    [Fact]
    public async Task GetActiveMapVersion_ReturnsPublishedVersion_OrThrowsNotFound()
    {
        using var dbContext = CreateDbContext();
        var warehouseId = Guid.NewGuid();
        var handler = new GetActiveMapVersionHandler(dbContext);

        await Assert.ThrowsAsync<NotFoundException>(() => handler.HandleAsync(warehouseId));

        var publishedMap = SeedMap(dbContext, warehouseId, MapStatus.PUBLISHED);
        await dbContext.SaveChangesAsync();

        var activeResponse = await handler.HandleAsync(warehouseId);
        Assert.Equal(publishedMap.Id, activeResponse.Id);
        Assert.Equal("PUBLISHED", activeResponse.Status);
    }
}

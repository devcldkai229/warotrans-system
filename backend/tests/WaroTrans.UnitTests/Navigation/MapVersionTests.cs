using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.ArchiveMapVersion;
using WaroTrans.Navigation.Features.CreateMapVersion;
using WaroTrans.Navigation.Features.GetActiveMapVersion;
using WaroTrans.Navigation.Features.GetMapVersion;
using WaroTrans.Navigation.Features.PublishMapVersion;
using WaroTrans.Navigation.Features.UpdateMapVersion;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.UnitTests.Navigation;

public class MapVersionTests
{
    private static NavigationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<NavigationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new NavigationDbContext(options);
    }

    [Fact]
    public async Task CreateMapVersion_IncrementsVersionNo_AndSetsDraftStatus()
    {
        using var dbContext = CreateDbContext();
        var validator = new CreateMapVersionValidator();
        var handler = new CreateMapVersionHandler(dbContext, validator);

        var warehouseId = Guid.NewGuid();
        var req1 = new CreateMapVersionRequest("Map V1", "http://storage/map1.yaml", 0.05, 0, 0, 0);
        var res1 = await handler.HandleAsync(warehouseId, req1);

        Assert.Equal(1, res1.VersionNo);
        Assert.Equal("DRAFT", res1.Status);
        Assert.Null(res1.PublishedAt);

        var req2 = new CreateMapVersionRequest("Map V2", "http://storage/map2.yaml", 0.05, 0, 0, 0);
        var res2 = await handler.HandleAsync(warehouseId, req2);

        Assert.Equal(2, res2.VersionNo);
        Assert.Equal("DRAFT", res2.Status);
    }

    [Fact]
    public async Task CreateMapVersion_ThrowsValidationException_WhenResolutionNonPositive()
    {
        using var dbContext = CreateDbContext();
        var validator = new CreateMapVersionValidator();
        var handler = new CreateMapVersionHandler(dbContext, validator);

        var warehouseId = Guid.NewGuid();
        var req = new CreateMapVersionRequest("Invalid Map", "http://storage/map.yaml", 0, 0, 0, 0);

        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            handler.HandleAsync(warehouseId, req));
    }

    [Fact]
    public async Task UpdateMapVersion_Succeeds_WhenDraft()
    {
        using var dbContext = CreateDbContext();
        var warehouseId = Guid.NewGuid();
        var map = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouseId,
            VersionNo = 1,
            Name = "Initial Draft",
            Status = MapStatus.DRAFT,
            MapUri = "http://storage/initial.yaml",
            Resolution = 0.05,
            OriginX = 0,
            OriginY = 0,
            OriginYaw = 0,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.MapVersions.Add(map);
        await dbContext.SaveChangesAsync();

        var validator = new UpdateMapVersionValidator();
        var handler = new UpdateMapVersionHandler(dbContext, validator);

        var updateReq = new UpdateMapVersionRequest("Updated Name", "http://storage/updated.yaml", 0.1, 10, 20, 1.57);
        var response = await handler.HandleAsync(map.Id, updateReq);

        Assert.Equal("Updated Name", response.Name);
        Assert.Equal("http://storage/updated.yaml", response.MapUri);
        Assert.Equal(0.1, response.Resolution);
        Assert.Equal(10, response.OriginX);
    }

    [Fact]
    public async Task UpdateMapVersion_Throws_WhenNotDraft()
    {
        using var dbContext = CreateDbContext();
        var map = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = Guid.NewGuid(),
            VersionNo = 1,
            Name = "Published Map",
            Status = MapStatus.PUBLISHED,
            MapUri = "http://storage/published.yaml",
            Resolution = 0.05,
            CreatedAt = DateTimeOffset.UtcNow,
            PublishedAt = DateTimeOffset.UtcNow
        };
        dbContext.MapVersions.Add(map);
        await dbContext.SaveChangesAsync();

        var validator = new UpdateMapVersionValidator();
        var handler = new UpdateMapVersionHandler(dbContext, validator);

        var updateReq = new UpdateMapVersionRequest("New Name", "http://storage/new.yaml", 0.05, 0, 0, 0);

        await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(map.Id, updateReq));
    }

    [Fact]
    public async Task PublishMapVersion_ArchivesExistingActiveMap_AndSetsPublished()
    {
        using var dbContext = CreateDbContext();
        var warehouseId = Guid.NewGuid();

        var map1 = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouseId,
            VersionNo = 1,
            Name = "Map 1 Active",
            Status = MapStatus.PUBLISHED,
            MapUri = "http://storage/map1.yaml",
            Resolution = 0.05,
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-1),
            PublishedAt = DateTimeOffset.UtcNow.AddDays(-1)
        };
        var map2 = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouseId,
            VersionNo = 2,
            Name = "Map 2 Draft",
            Status = MapStatus.DRAFT,
            MapUri = "http://storage/map2.yaml",
            Resolution = 0.05,
            CreatedAt = DateTimeOffset.UtcNow
        };

        dbContext.MapVersions.AddRange(map1, map2);
        await dbContext.SaveChangesAsync();

        var handler = new PublishMapVersionHandler(dbContext);
        var response = await handler.HandleAsync(map2.Id);

        Assert.Equal("PUBLISHED", response.Status);
        Assert.NotNull(response.PublishedAt);

        var reloadedMap1 = await dbContext.MapVersions.FindAsync(map1.Id);
        Assert.NotNull(reloadedMap1);
        Assert.Equal(MapStatus.ARCHIVED, reloadedMap1.Status);
    }

    [Fact]
    public async Task PublishMapVersion_Throws_WhenAlreadyPublishedOrArchived()
    {
        using var dbContext = CreateDbContext();
        var map = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = Guid.NewGuid(),
            VersionNo = 1,
            Name = "Archived Map",
            Status = MapStatus.ARCHIVED,
            MapUri = "http://storage/archived.yaml",
            Resolution = 0.05,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.MapVersions.Add(map);
        await dbContext.SaveChangesAsync();

        var handler = new PublishMapVersionHandler(dbContext);

        await Assert.ThrowsAsync<DomainValidationException>(() =>
            handler.HandleAsync(map.Id));
    }

    [Fact]
    public async Task ArchiveMapVersion_TransitionsStatusToArchived()
    {
        using var dbContext = CreateDbContext();
        var map = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = Guid.NewGuid(),
            VersionNo = 1,
            Name = "Draft Map",
            Status = MapStatus.DRAFT,
            MapUri = "http://storage/draft.yaml",
            Resolution = 0.05,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.MapVersions.Add(map);
        await dbContext.SaveChangesAsync();

        var handler = new ArchiveMapVersionHandler(dbContext);
        var response = await handler.HandleAsync(map.Id);

        Assert.Equal("ARCHIVED", response.Status);
    }

    [Fact]
    public async Task GetActiveMapVersion_ReturnsPublishedVersion_OrThrowsNotFound()
    {
        using var dbContext = CreateDbContext();
        var warehouseId = Guid.NewGuid();
        var handler = new GetActiveMapVersionHandler(dbContext);

        // Before publishing, throws NotFoundException
        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(warehouseId));

        var publishedMap = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouseId,
            VersionNo = 1,
            Name = "Active Map",
            Status = MapStatus.PUBLISHED,
            MapUri = "http://storage/active.yaml",
            Resolution = 0.05,
            CreatedAt = DateTimeOffset.UtcNow,
            PublishedAt = DateTimeOffset.UtcNow
        };
        dbContext.MapVersions.Add(publishedMap);
        await dbContext.SaveChangesAsync();

        var activeResponse = await handler.HandleAsync(warehouseId);
        Assert.Equal(publishedMap.Id, activeResponse.Id);
        Assert.Equal("PUBLISHED", activeResponse.Status);
    }
}

using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.CreateEdge;
using WaroTrans.Navigation.Features.DeleteEdge;
using WaroTrans.Navigation.Features.GetEdge;
using WaroTrans.Navigation.Features.UpdateEdge;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.UnitTests.Navigation;

public class EdgeTests
{
    private sealed class FakeCodeGenerator : IBusinessCodeGenerator
    {
        public int EdgeCalls { get; private set; }

        public Task<string> NextEdgeCodeAsync(CancellationToken cancellationToken = default)
        {
            EdgeCalls++;
            return Task.FromResult($"EDGE-{EdgeCalls:000}");
        }

        public Task<string> NextZoneCodeAsync(string suffix, CancellationToken cancellationToken = default) =>
            Task.FromResult($"ZONE-{suffix}");

        public Task<string> NextWarehouseCodeAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextCategoryCodeAsync(string suffix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextSkuCodeAsync(string prefix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextMapVersionCodeAsync(string warehouseCode, int versionNo, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextEndpointCodeAsync(string suffix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
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

    private static MapVersion AddMap(NavigationDbContext dbContext, MapStatus status = MapStatus.DRAFT)
    {
        var map = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = Guid.NewGuid(),
            Code = $"MAP-{Guid.NewGuid():N}"[..20],
            VersionNo = 1,
            Name = "Map",
            Status = status,
            MapUri = "/map-assets/map.pgm",
            FrameId = "map",
            Resolution = 0.05,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.MapVersions.Add(map);
        return map;
    }

    private static Edge AddEdge(NavigationDbContext dbContext, Guid mapVersionId, string code)
    {
        var edge = new Edge
        {
            Id = Guid.NewGuid(),
            MapVersionId = mapVersionId,
            Code = code,
            Geometry = JsonDocument.Parse("""{"type":"LineString","coordinates":[[0,0],[5,0]]}"""),
            WidthMeters = 1.0,
            Direction = EdgeDirection.BIDIRECTIONAL,
            Capacity = 1,
            MaxSpeed = null,
            IsActive = true
        };
        dbContext.Edges.Add(edge);
        return edge;
    }

    private static JsonElement LineString(params (double X, double Y)[] points)
    {
        var coords = points.Select(p => new[] { p.X, p.Y }).ToArray();
        return JsonSerializer.SerializeToElement(new { type = "LineString", coordinates = coords });
    }

    private static CreateEdgeHandler CreateHandler(NavigationDbContext dbContext, FakeCodeGenerator? generator = null) =>
        new(dbContext, generator ?? new FakeCodeGenerator(), new CreateEdgeValidator());

    private static UpdateEdgeHandler UpdateHandler(NavigationDbContext dbContext) =>
        new(dbContext, new UpdateEdgeValidator());

    private static CreateEdgeRequest ValidCreateRequest(string direction = "ONE_WAY", bool? isActive = null) =>
        new(
            LineString((1.0, 2.0), (2.5, 2.2), (4.0, 3.0)),
            1.2,
            direction,
            2,
            0.8,
            isActive);

    private static UpdateEdgeRequest ValidUpdateRequest(string direction = "BIDIRECTIONAL") =>
        new(
            LineString((10.0, 10.0), (20.0, 10.0)),
            2.0,
            direction,
            3,
            null,
            false);

    [Fact]
    public async Task CreateEdge_PersistsEdge_WithGeneratedCodeAndGeoJson()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        await dbContext.SaveChangesAsync();

        var response = await CreateHandler(dbContext).HandleAsync(map.Id, ValidCreateRequest());

        Assert.Equal("EDGE-001", response.Code);
        Assert.Equal(map.Id, response.MapVersionId);
        Assert.Equal("ONE_WAY", response.Direction);
        Assert.Equal(1.2, response.WidthMeters);
        Assert.Equal(2, response.Capacity);
        Assert.Equal(0.8, response.MaxSpeed);
        Assert.True(response.IsActive);
        Assert.Equal("LineString", response.Geometry.GetProperty("type").GetString());
        Assert.Equal(2.5, response.Geometry.GetProperty("coordinates")[1][0].GetDouble());

        var saved = await dbContext.Edges.SingleAsync();
        Assert.Equal("EDGE-001", saved.Code);
        Assert.Equal(EdgeDirection.ONE_WAY, saved.Direction);
        Assert.Equal(1.2, saved.WidthMeters);
        Assert.Equal("LineString", saved.Geometry.RootElement.GetProperty("type").GetString());
    }

    [Fact]
    public async Task CreateEdge_CallsGeneratorOncePerEdge()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        await dbContext.SaveChangesAsync();
        var generator = new FakeCodeGenerator();
        var handler = CreateHandler(dbContext, generator);

        var first = await handler.HandleAsync(map.Id, ValidCreateRequest());
        var second = await handler.HandleAsync(map.Id, ValidCreateRequest());

        Assert.Equal("EDGE-001", first.Code);
        Assert.Equal("EDGE-002", second.Code);
        Assert.Equal(2, generator.EdgeCalls);
    }

    [Fact]
    public async Task CreateEdge_AcceptsCaseInsensitiveDirection_AndNullMaxSpeed()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        await dbContext.SaveChangesAsync();

        var request = ValidCreateRequest("bidirectional") with { MaxSpeed = null };
        var response = await CreateHandler(dbContext).HandleAsync(map.Id, request);

        Assert.Equal("BIDIRECTIONAL", response.Direction);
        Assert.Null(response.MaxSpeed);
    }

    [Fact]
    public async Task CreateEdge_RespectsExplicitIsActiveFalse()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        await dbContext.SaveChangesAsync();

        var response = await CreateHandler(dbContext).HandleAsync(map.Id, ValidCreateRequest(isActive: false));

        Assert.False(response.IsActive);
    }

    [Fact]
    public async Task CreateEdge_ThrowsNotFound_WhenMapVersionMissing()
    {
        using var dbContext = CreateDbContext();
        var generator = new FakeCodeGenerator();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            CreateHandler(dbContext, generator).HandleAsync(Guid.NewGuid(), ValidCreateRequest()));

        Assert.Equal("map_version_not_found", ex.Code);
        Assert.Equal(0, generator.EdgeCalls);
    }

    [Theory]
    [InlineData(MapStatus.PUBLISHED)]
    [InlineData(MapStatus.ARCHIVED)]
    public async Task CreateEdge_ThrowsDomainValidation_WhenMapNotDraft(MapStatus status)
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext, status);
        await dbContext.SaveChangesAsync();
        var generator = new FakeCodeGenerator();

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            CreateHandler(dbContext, generator).HandleAsync(map.Id, ValidCreateRequest()));

        Assert.Equal("map_version_not_draft", ex.Code);
        Assert.Empty(dbContext.Edges);
        Assert.Equal(0, generator.EdgeCalls);
    }

    [Fact]
    public async Task CreateEdge_ThrowsValidationException_WhenRequestInvalid()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        await dbContext.SaveChangesAsync();
        var generator = new FakeCodeGenerator();

        var request = ValidCreateRequest() with { Capacity = 0 };

        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            CreateHandler(dbContext, generator).HandleAsync(map.Id, request));
        Assert.Empty(dbContext.Edges);
        Assert.Equal(0, generator.EdgeCalls);
    }

    public static TheoryData<CreateEdgeRequest> InvalidCreateRequests => new()
    {
        ValidCreateRequest() with { Geometry = JsonDocument.Parse("""{"type":"Point","coordinates":[1,2]}""").RootElement.Clone() },
        ValidCreateRequest() with { Geometry = JsonDocument.Parse("""{"type":"LineString","coordinates":[[1,1]]}""").RootElement.Clone() },
        ValidCreateRequest() with { Geometry = JsonDocument.Parse("""{"type":"LineString","coordinates":[[1,1],[NaN,2]]}""".Replace("NaN", "null")).RootElement.Clone() },
        ValidCreateRequest() with { WidthMeters = 0 },
        ValidCreateRequest() with { WidthMeters = -1 },
        ValidCreateRequest() with { Direction = "" },
        ValidCreateRequest() with { Direction = "TWO_WAY" },
        ValidCreateRequest() with { Capacity = 0 },
        ValidCreateRequest() with { Capacity = -1 },
        ValidCreateRequest() with { MaxSpeed = 0 },
        ValidCreateRequest() with { MaxSpeed = -0.5 },
        ValidCreateRequest() with { MaxSpeed = double.PositiveInfinity },
    };

    [Theory]
    [MemberData(nameof(InvalidCreateRequests))]
    public void CreateEdgeValidator_RejectsInvalidRequest(CreateEdgeRequest request)
    {
        Assert.False(new CreateEdgeValidator().Validate(request).IsValid);
    }

    [Fact]
    public void CreateEdgeValidator_AcceptsMinimalValidRequest()
    {
        var request = ValidCreateRequest() with
        {
            Geometry = LineString((-1, 0), (0, -1)),
            Capacity = 1,
            MaxSpeed = null
        };

        Assert.True(new CreateEdgeValidator().Validate(request).IsValid);
    }

    [Fact]
    public void CreateEdgeValidator_AcceptsEveryDirection()
    {
        foreach (var direction in Enum.GetNames<EdgeDirection>())
        {
            Assert.True(new CreateEdgeValidator().Validate(ValidCreateRequest(direction)).IsValid, direction);
        }
    }

    [Fact]
    public void UpdateEdgeValidator_RejectsInvalidFields()
    {
        var validator = new UpdateEdgeValidator();

        Assert.True(validator.Validate(ValidUpdateRequest()).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest() with
        {
            Geometry = JsonDocument.Parse("""{"type":"LineString","coordinates":[[1,1]]}""").RootElement.Clone()
        }).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest() with { WidthMeters = 0 }).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest("UNKNOWN")).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest() with { Capacity = 0 }).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest() with { MaxSpeed = 0 }).IsValid);
    }

    [Fact]
    public async Task GetEdges_ReturnsOnlyEdgesOfMap_OrderedByCode_WithGeometry()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        var otherMap = AddMap(dbContext);
        AddEdge(dbContext, map.Id, "EDGE-002");
        AddEdge(dbContext, map.Id, "EDGE-001");
        AddEdge(dbContext, otherMap.Id, "EDGE-003");
        await dbContext.SaveChangesAsync();

        var response = await new GetEdgeHandler(dbContext).GetByMapVersionIdAsync(map.Id);

        Assert.Equal(["EDGE-001", "EDGE-002"], response.Select(e => e.Code));
        Assert.All(response, e => Assert.Equal(map.Id, e.MapVersionId));
        Assert.Equal("LineString", response[0].Geometry.GetProperty("type").GetString());
        Assert.Equal(5, response[0].Geometry.GetProperty("coordinates")[1][0].GetDouble());
    }

    [Fact]
    public async Task GetEdges_ReturnsEmpty_WhenMapHasNoEdges()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext, MapStatus.PUBLISHED);
        await dbContext.SaveChangesAsync();

        var response = await new GetEdgeHandler(dbContext).GetByMapVersionIdAsync(map.Id);

        Assert.Empty(response);
    }

    [Fact]
    public async Task GetEdges_ThrowsNotFound_WhenMapVersionMissing()
    {
        using var dbContext = CreateDbContext();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetEdgeHandler(dbContext).GetByMapVersionIdAsync(Guid.NewGuid()));

        Assert.Equal("map_version_not_found", ex.Code);
    }

    [Fact]
    public async Task GetEdgeById_ReturnsEdge()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        var edge = AddEdge(dbContext, map.Id, "EDGE-007");
        await dbContext.SaveChangesAsync();

        var response = await new GetEdgeHandler(dbContext).GetByIdAsync(edge.Id);

        Assert.Equal(edge.Id, response.Id);
        Assert.Equal("EDGE-007", response.Code);
        Assert.Equal("BIDIRECTIONAL", response.Direction);
        Assert.Equal(2, response.Geometry.GetProperty("coordinates").GetArrayLength());
        Assert.Equal(1.0, response.WidthMeters);
    }

    [Fact]
    public async Task GetEdgeById_ThrowsNotFound_WhenMissing()
    {
        using var dbContext = CreateDbContext();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetEdgeHandler(dbContext).GetByIdAsync(Guid.NewGuid()));

        Assert.Equal("edge_not_found", ex.Code);
    }

    [Fact]
    public async Task UpdateEdge_UpdatesFields_AndKeepsCode()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        var edge = AddEdge(dbContext, map.Id, "EDGE-001");
        await dbContext.SaveChangesAsync();

        var response = await UpdateHandler(dbContext).HandleAsync(edge.Id, ValidUpdateRequest("one_way"));

        Assert.Equal("EDGE-001", response.Code);
        Assert.Equal("ONE_WAY", response.Direction);
        Assert.Equal(2.0, response.WidthMeters);
        Assert.Equal(3, response.Capacity);
        Assert.Null(response.MaxSpeed);
        Assert.False(response.IsActive);
        Assert.Equal(20, response.Geometry.GetProperty("coordinates")[1][0].GetDouble());

        var saved = await dbContext.Edges.SingleAsync();
        Assert.Equal("EDGE-001", saved.Code);
        Assert.Equal(EdgeDirection.ONE_WAY, saved.Direction);
        Assert.Equal(3, saved.Capacity);
        Assert.False(saved.IsActive);
        Assert.Equal(20, saved.Geometry.RootElement.GetProperty("coordinates")[1][0].GetDouble());
    }

    [Fact]
    public async Task UpdateEdge_ThrowsNotFound_WhenEdgeMissing()
    {
        using var dbContext = CreateDbContext();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            UpdateHandler(dbContext).HandleAsync(Guid.NewGuid(), ValidUpdateRequest()));

        Assert.Equal("edge_not_found", ex.Code);
    }

    [Fact]
    public async Task UpdateEdge_ThrowsNotFound_WhenMapVersionMissing()
    {
        using var dbContext = CreateDbContext();
        var edge = AddEdge(dbContext, Guid.NewGuid(), "EDGE-001");
        await dbContext.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            UpdateHandler(dbContext).HandleAsync(edge.Id, ValidUpdateRequest()));

        Assert.Equal("map_version_not_found", ex.Code);
    }

    [Theory]
    [InlineData(MapStatus.PUBLISHED)]
    [InlineData(MapStatus.ARCHIVED)]
    public async Task UpdateEdge_ThrowsDomainValidation_WhenMapNotDraft(MapStatus status)
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext, status);
        var edge = AddEdge(dbContext, map.Id, "EDGE-001");
        await dbContext.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            UpdateHandler(dbContext).HandleAsync(edge.Id, ValidUpdateRequest()));

        Assert.Equal("map_version_not_draft", ex.Code);
        var saved = await dbContext.Edges.AsNoTracking().SingleAsync();
        Assert.Equal(1, saved.Capacity);
        Assert.True(saved.IsActive);
    }

    [Fact]
    public async Task UpdateEdge_ThrowsValidationException_WhenRequestInvalid()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        var edge = AddEdge(dbContext, map.Id, "EDGE-001");
        await dbContext.SaveChangesAsync();

        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            UpdateHandler(dbContext).HandleAsync(edge.Id, ValidUpdateRequest() with { Capacity = 0 }));
    }

    [Fact]
    public async Task DeleteEdge_RemovesOnlyThatEdge()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        var edge = AddEdge(dbContext, map.Id, "EDGE-001");
        var other = AddEdge(dbContext, map.Id, "EDGE-002");
        await dbContext.SaveChangesAsync();

        await new DeleteEdgeHandler(dbContext).HandleAsync(edge.Id);

        var remaining = await dbContext.Edges.AsNoTracking().SingleAsync();
        Assert.Equal(other.Id, remaining.Id);
    }

    [Fact]
    public async Task DeleteEdge_ThrowsNotFound_WhenEdgeMissing()
    {
        using var dbContext = CreateDbContext();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            new DeleteEdgeHandler(dbContext).HandleAsync(Guid.NewGuid()));

        Assert.Equal("edge_not_found", ex.Code);
    }

    [Fact]
    public async Task DeleteEdge_ThrowsNotFound_WhenMapVersionMissing()
    {
        using var dbContext = CreateDbContext();
        var edge = AddEdge(dbContext, Guid.NewGuid(), "EDGE-001");
        await dbContext.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            new DeleteEdgeHandler(dbContext).HandleAsync(edge.Id));

        Assert.Equal("map_version_not_found", ex.Code);
        Assert.Single(dbContext.Edges);
    }

    [Theory]
    [InlineData(MapStatus.PUBLISHED)]
    [InlineData(MapStatus.ARCHIVED)]
    public async Task DeleteEdge_ThrowsDomainValidation_WhenMapNotDraft(MapStatus status)
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext, status);
        var edge = AddEdge(dbContext, map.Id, "EDGE-001");
        await dbContext.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            new DeleteEdgeHandler(dbContext).HandleAsync(edge.Id));

        Assert.Equal("map_version_not_draft", ex.Code);
        Assert.Single(dbContext.Edges);
    }
}

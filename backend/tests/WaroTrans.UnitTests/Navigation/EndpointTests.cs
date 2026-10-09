using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.CreateEndpoint;
using WaroTrans.Navigation.Features.GetEndpoint;
using WaroTrans.Navigation.Features.UpdateEndpoint;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.UnitTests.Navigation;

public class EndpointTests
{
    /// <summary>
    /// The real generator needs PostgreSQL (SELECT ... FOR UPDATE); it is covered by integration tests.
    /// This fake records the suffix the handler passes in and returns a fixed code.
    /// </summary>
    private sealed class FakeCodeGenerator(string codeToReturn = "EP-GENERATED") : IBusinessCodeGenerator
    {
        public List<string> EndpointSuffixes { get; } = [];

        public Task<string> NextEndpointCodeAsync(string suffix, CancellationToken cancellationToken = default)
        {
            EndpointSuffixes.Add(suffix);
            return Task.FromResult(codeToReturn);
        }

        public Task<string> NextWarehouseCodeAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextCategoryCodeAsync(string suffix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextSkuCodeAsync(string prefix, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string> NextMapVersionCodeAsync(string warehouseCode, int versionNo, CancellationToken cancellationToken = default) => throw new NotSupportedException();
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
            VersionNo = 1,
            Name = "Map",
            Status = status,
            MapUri = "http://storage/map.yaml",
            Resolution = 0.05,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.MapVersions.Add(map);
        return map;
    }

    private static Endpoint AddEndpoint(NavigationDbContext dbContext, Guid mapVersionId, EndpointType type, string code)
    {
        var endpoint = new Endpoint
        {
            Id = Guid.NewGuid(),
            MapVersionId = mapVersionId,
            Code = code,
            Name = code,
            EndpointType = type,
            X = 1,
            Y = 1,
            Yaw = 0,
            PositionTolerance = 0.1,
            YawTolerance = 0.2,
            IsEnabled = true
        };
        dbContext.Endpoints.Add(endpoint);
        return endpoint;
    }

    private static CreateEndpointHandler CreateHandler(NavigationDbContext dbContext, IBusinessCodeGenerator? codeGenerator = null) =>
        new(dbContext, codeGenerator ?? new FakeCodeGenerator(), new CreateEndpointValidator());

    private static UpdateEndpointHandler UpdateHandler(NavigationDbContext dbContext) =>
        new(dbContext, new UpdateEndpointValidator());

    private static CreateEndpointRequest ValidCreateRequest(string type = "INBOUND", bool? isEnabled = null) =>
        new("Receiving dock 1", type, 12.5, 3.25, 1.57, 0.1, 0.2, isEnabled);

    private static UpdateEndpointRequest ValidUpdateRequest(string type = "INBOUND") =>
        new("Renamed", type, 20, 30, -1.0, 0.15, 0.3, false);

    /* ------------------------------------------------------------ CreateEndpoint */

    [Fact]
    public async Task CreateEndpoint_PersistsEndpoint_WithCodeFromGenerator()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        await dbContext.SaveChangesAsync();
        var generator = new FakeCodeGenerator("EP-RECEIVING-DOCK-1");

        var response = await CreateHandler(dbContext, generator).HandleAsync(map.Id, ValidCreateRequest());

        Assert.Equal("EP-RECEIVING-DOCK-1", response.Code);
        Assert.Equal(map.Id, response.MapVersionId);
        Assert.Equal("Receiving dock 1", response.Name);
        Assert.Equal("INBOUND", response.EndpointType);
        Assert.Equal(12.5, response.X);
        Assert.Equal(3.25, response.Y);
        Assert.Equal(1.57, response.Yaw);
        Assert.Equal(0.1, response.PositionTolerance);
        Assert.Equal(0.2, response.YawTolerance);
        Assert.True(response.IsEnabled);

        var saved = await dbContext.Endpoints.SingleAsync();
        Assert.Equal(response.Id, saved.Id);
        Assert.Equal("EP-RECEIVING-DOCK-1", saved.Code);
        Assert.Equal(EndpointType.INBOUND, saved.EndpointType);
    }

    [Fact]
    public async Task CreateEndpoint_PassesTrimmedName_AsGeneratorSuffix()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        await dbContext.SaveChangesAsync();
        var generator = new FakeCodeGenerator();

        var request = ValidCreateRequest() with { Name = "  Shelf A  " };
        var response = await CreateHandler(dbContext, generator).HandleAsync(map.Id, request);

        Assert.Equal(["Shelf A"], generator.EndpointSuffixes);
        Assert.Equal("Shelf A", response.Name);
    }

    [Fact]
    public async Task CreateEndpoint_AcceptsCaseInsensitiveType()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        await dbContext.SaveChangesAsync();

        var response = await CreateHandler(dbContext).HandleAsync(map.Id, ValidCreateRequest("maintenance"));

        Assert.Equal("MAINTENANCE", response.EndpointType);
    }

    [Fact]
    public async Task CreateEndpoint_RespectsExplicitIsEnabledFalse()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        await dbContext.SaveChangesAsync();

        var response = await CreateHandler(dbContext).HandleAsync(map.Id, ValidCreateRequest(isEnabled: false));

        Assert.False(response.IsEnabled);
    }

    [Fact]
    public async Task CreateEndpoint_ThrowsConflict_WhenCodeAlreadyExistsOnMap()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        AddEndpoint(dbContext, map.Id, EndpointType.STORAGE, "EP-SHELF-A");
        await dbContext.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            CreateHandler(dbContext, new FakeCodeGenerator("EP-SHELF-A")).HandleAsync(map.Id, ValidCreateRequest()));

        Assert.Equal("endpoint_code_conflict", ex.Code);
        Assert.Equal(1, await dbContext.Endpoints.CountAsync());
    }

    [Fact]
    public async Task CreateEndpoint_AllowsSameCode_OnDifferentMapVersion()
    {
        using var dbContext = CreateDbContext();
        var map1 = AddMap(dbContext);
        var map2 = AddMap(dbContext);
        AddEndpoint(dbContext, map1.Id, EndpointType.STORAGE, "EP-SHELF-A");
        await dbContext.SaveChangesAsync();

        var response = await CreateHandler(dbContext, new FakeCodeGenerator("EP-SHELF-A"))
            .HandleAsync(map2.Id, ValidCreateRequest("STORAGE"));

        Assert.Equal("EP-SHELF-A", response.Code);
        Assert.Equal(map2.Id, response.MapVersionId);
    }

    [Fact]
    public async Task CreateEndpoint_ThrowsNotFound_WhenMapVersionMissing()
    {
        using var dbContext = CreateDbContext();
        var generator = new FakeCodeGenerator();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            CreateHandler(dbContext, generator).HandleAsync(Guid.NewGuid(), ValidCreateRequest()));

        Assert.Equal("map_version_not_found", ex.Code);
        Assert.Empty(generator.EndpointSuffixes);
    }

    [Theory]
    [InlineData(MapStatus.PUBLISHED)]
    [InlineData(MapStatus.ARCHIVED)]
    public async Task CreateEndpoint_ThrowsDomainValidation_WhenMapNotDraft(MapStatus status)
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext, status);
        await dbContext.SaveChangesAsync();
        var generator = new FakeCodeGenerator();

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            CreateHandler(dbContext, generator).HandleAsync(map.Id, ValidCreateRequest()));

        Assert.Equal("map_version_not_draft", ex.Code);
        Assert.Empty(dbContext.Endpoints);
        Assert.Empty(generator.EndpointSuffixes);
    }

    [Fact]
    public async Task CreateEndpoint_ThrowsValidationException_WhenRequestInvalid()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        await dbContext.SaveChangesAsync();
        var generator = new FakeCodeGenerator();

        var request = ValidCreateRequest() with { PositionTolerance = 0 };

        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            CreateHandler(dbContext, generator).HandleAsync(map.Id, request));
        Assert.Empty(dbContext.Endpoints);
        Assert.Empty(generator.EndpointSuffixes);
    }

    /* ------------------------------------------------------------ Validators */

    public static TheoryData<CreateEndpointRequest, string> InvalidCreateRequests => new()
    {
        { ValidCreateRequest() with { Name = "" }, nameof(CreateEndpointRequest.Name) },
        { ValidCreateRequest() with { Name = "   " }, nameof(CreateEndpointRequest.Name) },
        { ValidCreateRequest() with { Name = new string('a', 98) }, nameof(CreateEndpointRequest.Name) },
        { ValidCreateRequest() with { EndpointType = "" }, nameof(CreateEndpointRequest.EndpointType) },
        { ValidCreateRequest() with { EndpointType = "SHELF" }, nameof(CreateEndpointRequest.EndpointType) },
        { ValidCreateRequest() with { X = double.NaN }, nameof(CreateEndpointRequest.X) },
        { ValidCreateRequest() with { Y = double.PositiveInfinity }, nameof(CreateEndpointRequest.Y) },
        { ValidCreateRequest() with { Yaw = 3.2 }, nameof(CreateEndpointRequest.Yaw) },
        { ValidCreateRequest() with { Yaw = -3.2 }, nameof(CreateEndpointRequest.Yaw) },
        { ValidCreateRequest() with { PositionTolerance = 0 }, nameof(CreateEndpointRequest.PositionTolerance) },
        { ValidCreateRequest() with { PositionTolerance = -0.1 }, nameof(CreateEndpointRequest.PositionTolerance) },
        { ValidCreateRequest() with { PositionTolerance = double.PositiveInfinity }, nameof(CreateEndpointRequest.PositionTolerance) },
        { ValidCreateRequest() with { YawTolerance = 0 }, nameof(CreateEndpointRequest.YawTolerance) },
        { ValidCreateRequest() with { YawTolerance = 3.2 }, nameof(CreateEndpointRequest.YawTolerance) },
    };

    [Theory]
    [MemberData(nameof(InvalidCreateRequests))]
    public void CreateEndpointValidator_RejectsInvalidField(CreateEndpointRequest request, string propertyName)
    {
        var result = new CreateEndpointValidator().Validate(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == propertyName);
    }

    [Fact]
    public void CreateEndpointValidator_AcceptsBoundaryValues()
    {
        var request = ValidCreateRequest() with
        {
            Name = new string('a', 97),
            Yaw = Math.PI,
            YawTolerance = Math.PI,
            X = -5,
            Y = 0
        };

        Assert.True(new CreateEndpointValidator().Validate(request).IsValid);
        Assert.True(new CreateEndpointValidator().Validate(request with { Yaw = -Math.PI }).IsValid);
    }

    [Fact]
    public void CreateEndpointValidator_AcceptsEveryEndpointType()
    {
        foreach (var type in Enum.GetNames<EndpointType>())
        {
            Assert.True(new CreateEndpointValidator().Validate(ValidCreateRequest(type)).IsValid, type);
        }
    }

    [Fact]
    public void UpdateEndpointValidator_RejectsInvalidFields()
    {
        var validator = new UpdateEndpointValidator();

        Assert.True(validator.Validate(ValidUpdateRequest()).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest() with { Name = " " }).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest() with { Name = new string('a', 256) }).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest("UNKNOWN")).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest() with { Yaw = 4 }).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest() with { PositionTolerance = 0 }).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest() with { YawTolerance = 0 }).IsValid);
        Assert.False(validator.Validate(ValidUpdateRequest() with { X = double.NaN }).IsValid);
    }

    /* ------------------------------------------------------------ GetEndpoint */

    [Fact]
    public async Task GetEndpoints_ReturnsOnlyEndpointsOfMap_OrderedByCode()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        var otherMap = AddMap(dbContext);
        AddEndpoint(dbContext, map.Id, EndpointType.STORAGE, "EP-SHELF-A");
        AddEndpoint(dbContext, map.Id, EndpointType.CHARGING, "EP-CHARGER-1");
        AddEndpoint(dbContext, otherMap.Id, EndpointType.INBOUND, "EP-DOCK-1");
        await dbContext.SaveChangesAsync();

        var response = await new GetEndpointHandler(dbContext).GetByMapVersionIdAsync(map.Id);

        Assert.Equal(["EP-CHARGER-1", "EP-SHELF-A"], response.Select(e => e.Code));
        Assert.All(response, e => Assert.Equal(map.Id, e.MapVersionId));
    }

    [Fact]
    public async Task GetEndpoints_ReturnsEmpty_WhenMapHasNoEndpoints()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext, MapStatus.PUBLISHED);
        await dbContext.SaveChangesAsync();

        var response = await new GetEndpointHandler(dbContext).GetByMapVersionIdAsync(map.Id);

        Assert.Empty(response);
    }

    [Fact]
    public async Task GetEndpoints_ThrowsNotFound_WhenMapVersionMissing()
    {
        using var dbContext = CreateDbContext();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetEndpointHandler(dbContext).GetByMapVersionIdAsync(Guid.NewGuid()));

        Assert.Equal("map_version_not_found", ex.Code);
    }

    [Fact]
    public async Task GetEndpointById_ReturnsEndpoint()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        var endpoint = AddEndpoint(dbContext, map.Id, EndpointType.OUTBOUND, "EP-OUTBOUND-01");
        await dbContext.SaveChangesAsync();

        var response = await new GetEndpointHandler(dbContext).GetByIdAsync(endpoint.Id);

        Assert.Equal(endpoint.Id, response.Id);
        Assert.Equal("EP-OUTBOUND-01", response.Code);
        Assert.Equal("OUTBOUND", response.EndpointType);
    }

    [Fact]
    public async Task GetEndpointById_ThrowsNotFound_WhenMissing()
    {
        using var dbContext = CreateDbContext();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetEndpointHandler(dbContext).GetByIdAsync(Guid.NewGuid()));

        Assert.Equal("endpoint_not_found", ex.Code);
    }

    /* ------------------------------------------------------------ UpdateEndpoint */

    [Fact]
    public async Task UpdateEndpoint_UpdatesFields_AndKeepsCode()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        var endpoint = AddEndpoint(dbContext, map.Id, EndpointType.INBOUND, "EP-DOCK-1");
        await dbContext.SaveChangesAsync();

        var response = await UpdateHandler(dbContext).HandleAsync(endpoint.Id, ValidUpdateRequest("charging"));

        Assert.Equal("EP-DOCK-1", response.Code);
        Assert.Equal("Renamed", response.Name);
        Assert.Equal("CHARGING", response.EndpointType);
        Assert.Equal(20, response.X);
        Assert.Equal(30, response.Y);
        Assert.Equal(-1.0, response.Yaw);
        Assert.Equal(0.15, response.PositionTolerance);
        Assert.Equal(0.3, response.YawTolerance);
        Assert.False(response.IsEnabled);

        var saved = await dbContext.Endpoints.SingleAsync();
        Assert.Equal("EP-DOCK-1", saved.Code);
        Assert.Equal("Renamed", saved.Name);
        Assert.Equal(EndpointType.CHARGING, saved.EndpointType);
        Assert.Equal(20, saved.X);
        Assert.False(saved.IsEnabled);
    }

    [Fact]
    public async Task UpdateEndpoint_ThrowsNotFound_WhenEndpointMissing()
    {
        using var dbContext = CreateDbContext();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            UpdateHandler(dbContext).HandleAsync(Guid.NewGuid(), ValidUpdateRequest()));

        Assert.Equal("endpoint_not_found", ex.Code);
    }

    [Fact]
    public async Task UpdateEndpoint_ThrowsNotFound_WhenMapVersionMissing()
    {
        using var dbContext = CreateDbContext();
        var endpoint = AddEndpoint(dbContext, Guid.NewGuid(), EndpointType.INBOUND, "EP-DOCK-1");
        await dbContext.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<NotFoundException>(() =>
            UpdateHandler(dbContext).HandleAsync(endpoint.Id, ValidUpdateRequest()));

        Assert.Equal("map_version_not_found", ex.Code);
    }

    [Theory]
    [InlineData(MapStatus.PUBLISHED)]
    [InlineData(MapStatus.ARCHIVED)]
    public async Task UpdateEndpoint_ThrowsDomainValidation_WhenMapNotDraft(MapStatus status)
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext, status);
        var endpoint = AddEndpoint(dbContext, map.Id, EndpointType.INBOUND, "EP-DOCK-1");
        await dbContext.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            UpdateHandler(dbContext).HandleAsync(endpoint.Id, ValidUpdateRequest()));

        Assert.Equal("map_version_not_draft", ex.Code);
        var saved = await dbContext.Endpoints.AsNoTracking().SingleAsync();
        Assert.Equal("EP-DOCK-1", saved.Name);
    }

    [Fact]
    public async Task UpdateEndpoint_ThrowsValidationException_WhenRequestInvalid()
    {
        using var dbContext = CreateDbContext();
        var map = AddMap(dbContext);
        var endpoint = AddEndpoint(dbContext, map.Id, EndpointType.INBOUND, "EP-DOCK-1");
        await dbContext.SaveChangesAsync();

        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            UpdateHandler(dbContext).HandleAsync(endpoint.Id, ValidUpdateRequest() with { YawTolerance = -1 }));
    }
}

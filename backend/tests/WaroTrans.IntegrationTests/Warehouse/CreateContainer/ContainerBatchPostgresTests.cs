using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using FluentValidation;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.Services;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Features.CreateContainer;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.IntegrationTests.Warehouse.CreateContainer;

/// <summary>No shared fixture/reset/Host services: each test creates and drops its own database on an opt-in server.</summary>
public sealed class ContainerBatchPostgresTests : IAsyncLifetime
{
    public const string ConnectionEnvironment = "WAROTRANS_CONTAINER_TEST_POSTGRES";
    private const string Route = "/api/warehouse/containers";
    private readonly string _database = $"container_batch_{Guid.NewGuid():N}";
    private string _adminConnection = null!;
    private string _connection = null!;
    private readonly Guid _warehouse = Guid.NewGuid();
    private readonly Guid _productA = Guid.NewGuid();
    private readonly Guid _productB = Guid.NewGuid();
    private readonly Guid _location = Guid.NewGuid();
    private readonly Guid _endpoint = Guid.NewGuid();
    private readonly Guid _map = Guid.NewGuid();
    private readonly ReceivingOptions _receiving = new();

    public async Task InitializeAsync()
    {
        var configured = Environment.GetEnvironmentVariable(ConnectionEnvironment)
            ?? throw new InvalidOperationException($"Set {ConnectionEnvironment} to an isolated PostgreSQL server.");
        var builder = new NpgsqlConnectionStringBuilder(configured) { Database = "postgres", Pooling = false };
        _adminConnection = builder.ConnectionString;
        await using var admin = new NpgsqlConnection(_adminConnection);
        await admin.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE {_database}", admin);
        await command.ExecuteNonQueryAsync();
        builder.Database = _database;
        _connection = builder.ConnectionString;
        await using var codes = Codes();
        await codes.Database.MigrateAsync();
        await using var db = Warehouse();
        await db.Database.MigrateAsync();
        await using var navigation = Navigation();
        await navigation.Database.MigrateAsync();
        var category = new ProductCategory { Id = Guid.NewGuid(), Code = "CAT", Name = "Category" };
        db.ProductCategories.Add(category);
        db.Warehouses.Add(new WaroTrans.Warehouse.Entities.Warehouse { Id = _warehouse, Code = "WH-TEST", Name = "Receiving", IsActive = true });
        db.Products.AddRange(
            new Product { Id = _productA, CategoryId = category.Id, Sku = "A", Name = "A", IsActive = true },
            new Product { Id = _productB, CategoryId = category.Id, Sku = "B", Name = "B", IsActive = true });
        db.StorageLocations.Add(new StorageLocation { Id = _location, WarehouseId = _warehouse, EndpointId = _endpoint, Code = "DOCK", Name = "Receiving", IsActive = true });
        await db.SaveChangesAsync();
        navigation.MapVersions.Add(new MapVersion { Id = _map, WarehouseId = _warehouse, Code = "MAP-TEST", Name = "Map", VersionNo = 1, Status = MapStatus.PUBLISHED });
        navigation.Endpoints.Add(new Endpoint { Id = _endpoint, MapVersionId = _map, Code = "EP-DOCK", Name = "Dock", EndpointType = EndpointType.WAYPOINT, IsEnabled = true });
        await navigation.SaveChangesAsync();
        _receiving.InboundStorageLocations[_warehouse.ToString()] = _location;
    }

    public async Task DisposeAsync()
    {
        if (_adminConnection is null) return;
        await using var admin = new NpgsqlConnection(_adminConnection);
        await admin.OpenAsync();
        // Generated identifier only. No other database is ever reset or dropped.
        await using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS {_database} WITH (FORCE)", admin);
        await command.ExecuteNonQueryAsync();
    }

    [IsolatedPostgresFact]
    public async Task Same_route_preserves_legacy_201_and_returns_complete_batch_200_with_persisted_contents()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var legacy = await client.PostAsJsonAsync(Route, new { productId = _productA });
        Assert.Equal(HttpStatusCode.Created, legacy.StatusCode);
        Assert.NotNull(legacy.Headers.Location);
        var old = (await legacy.Content.ReadFromJsonAsync<CreateContainerResponse>())!;
        Assert.Equal(_productA, old.ProductId);
        var request = Request();
        var response = await client.PostAsJsonAsync(Route, request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var batch = (await response.Content.ReadFromJsonAsync<CreateContainerBatchResponse>())!;
        Assert.Equal(10, batch.Items.Count);
        Assert.False(batch.Replayed);
        Assert.Equal(18, batch.Items.Single(i => i.GroupKey == "a" && i.ContainerNo == 2).ContentsQuantity);
        Assert.All(batch.Items, i => { Assert.Equal(_location, i.CurrentStorageLocationId); Assert.Equal(_endpoint, i.CurrentEndpointId); });
        await using var db = Warehouse();
        Assert.Equal(11, await db.Containers.CountAsync());
        Assert.Null((await db.Containers.SingleAsync(c => c.Id == old.Id)).ContentsQuantity);
        var details = await new WaroTrans.Warehouse.Features.GetContainer.GetContainerHandler(db).GetByBarcodeAsync(batch.Items[1].Barcode);
        Assert.Equal(18, details.ContentsQuantity);
        Assert.Equal("pcs", details.ContentsUnit);
        Assert.Empty(await db.InventoryStocks.ToListAsync());
        Assert.Empty(await db.StockVouchers.ToListAsync());
        var replay = await client.PostAsJsonAsync(Route, request);
        Assert.True((await replay.Content.ReadFromJsonAsync<CreateContainerBatchResponse>())!.Replayed);
    }

    [IsolatedPostgresFact]
    public async Task Authentication_permissions_and_unknown_or_incomplete_json_fail_before_creating_containers()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Anonymous", "1");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync(Route, Request())).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Anonymous");
        client.DefaultRequestHeaders.Add("X-Role", "TECHNICIAN");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(Route, Request())).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Role");
        using var typo = new StringContent($$"""{"productId":"{{_productA}}","containerCout":2}""", Encoding.UTF8, "application/json");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(Route, typo)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Route, Request() with { ContainerCount = 11 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Route, Request() with { Groups = null })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Route, Request() with { RequestId = null })).StatusCode);
        await using var db = Warehouse();
        Assert.Empty(await db.Containers.ToListAsync());
    }

    [IsolatedPostgresFact]
    public async Task Concurrent_identical_receiving_requests_return_one_receipt_with_the_same_ids_and_barcodes()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        var request = Request();
        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => client.PostAsJsonAsync(Route, request)));
        foreach (var response in responses) Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var receipts = await Task.WhenAll(responses.Select(async r => (await r.Content.ReadFromJsonAsync<CreateContainerBatchResponse>())!));
        Assert.Single(receipts, r => !r.Replayed);
        foreach (var receipt in receipts) Assert.Equal(receipts[0].Items.Select(i => (i.Id, i.Barcode)), receipt.Items.Select(i => (i.Id, i.Barcode)));
        await using var db = Warehouse();
        Assert.Equal(10, await db.Containers.CountAsync());
        var different = request with { Groups = [new("a", _productA, 10, 99, "pcs")] };
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(Route, different)).StatusCode);
        Assert.Equal(10, await db.Containers.CountAsync());
    }

    [IsolatedPostgresFact]
    public async Task Database_failure_on_last_container_rolls_back_the_whole_batch_and_retry_can_succeed()
    {
        var request = Request();
        await using (var db = Warehouse(new InvalidLastContainer()))
        await using (var codes = Codes())
        await using (var navigation = Navigation())
        {
            var handler = Handler(db, new BusinessCodeGenerator(codes), navigation);
            await Assert.ThrowsAsync<DbUpdateException>(() => handler.HandleAsync(request));
        }
        await using (var check = Warehouse()) Assert.Empty(await check.Containers.ToListAsync());
        await using var retryDb = Warehouse();
        await using var retryCodes = Codes();
        await using var retryNavigation = Navigation();
        var result = await Handler(retryDb, new BusinessCodeGenerator(retryCodes), retryNavigation).HandleAsync(request);
        Assert.False(result.Replayed);
        Assert.Equal(10, await retryDb.Containers.CountAsync());
        Assert.Empty(await retryDb.InventoryStocks.ToListAsync());
    }

    [IsolatedPostgresFact]
    public async Task Batch_and_single_code_generation_share_one_unique_sequence_even_when_a_context_is_reused()
    {
        var day = new DateOnly(2031, 1, 15);
        await using var trackedDb = Codes();
        var tracked = new BusinessCodeGenerator(trackedDb);
        var first = await tracked.NextContainerCodesAsync(3, day);
        var ranges = await Task.WhenAll(Enumerable.Range(0, 12).Select(async _ =>
        {
            await using var db = Codes();
            return await new BusinessCodeGenerator(db).NextContainerCodesAsync(4, day);
        }));
        var last = await tracked.NextContainerCodeAsync(day);
        var all = first.Concat(ranges.SelectMany(r => r)).Append(last).ToArray();
        Assert.Equal(52, all.Length);
        Assert.Equal(52, all.Distinct().Count());
        Assert.Equal("CTN-20310115-000052", last);
        Assert.Equal("WH-001", await tracked.NextWarehouseCodeAsync());
        await using var otherDb = Codes();
        Assert.Equal("WH-002", await new BusinessCodeGenerator(otherDb).NextWarehouseCodeAsync());
        Assert.Equal("WH-003", await tracked.NextWarehouseCodeAsync());
    }

    [IsolatedPostgresFact]
    public async Task Migration_round_trip_preserves_a_legacy_container_without_inventing_contents()
    {
        await using var db = Warehouse();
        var migrations = db.Database.GetMigrations().ToArray();
        Assert.EndsWith("AddContainerBatchContents", migrations[^1]);
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync(migrations[^2]);
        var id = Guid.NewGuid();
        var actor = new TestActor().AccountId!.Value;
        var now = DateTimeOffset.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO warehouse.containers (id, product_id, barcode, status, created_by, created_at, updated_at) VALUES ({id}, {_productA}, {"CTN-LEGACY"}, {"CREATED"}, {actor}, {now}, {now})");
        await migrator.MigrateAsync();
        var old = await db.Containers.SingleAsync(c => c.Id == id);
        Assert.Equal("CTN-LEGACY", old.Barcode);
        Assert.Equal(_productA, old.ProductId);
        Assert.Null(old.ContentsQuantity);
        Assert.Null(old.ContentsUnit);
        Assert.Null(old.CreationRequestId);
    }

    [IsolatedPostgresFact]
    public async Task Real_navigation_catalog_requires_an_enabled_endpoint_on_a_published_map()
    {
        await using var app = await ServerAsync();
        using var client = app.GetTestClient();
        await using var navigation = Navigation();
        var map = await navigation.MapVersions.SingleAsync();
        map.Status = MapStatus.DRAFT;
        await navigation.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(Route, Request())).StatusCode);
        map.Status = MapStatus.PUBLISHED;
        var endpoint = await navigation.Endpoints.SingleAsync();
        endpoint.IsEnabled = false;
        await navigation.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(Route, Request())).StatusCode);
        await using var db = Warehouse();
        Assert.Empty(await db.Containers.ToListAsync());
    }

    private CreateContainerRequest Request() => new(WarehouseId: _warehouse, RequestId: Guid.NewGuid(), ContainerCount: 10,
        Groups: [new("a", _productA, 6, 24, "pcs", [new(2, 18)]), new("b", _productB, 4, 12, "pcs")]);

    private WarehouseDbContext Warehouse(params IInterceptor[] interceptors) => new(new DbContextOptionsBuilder<WarehouseDbContext>()
        .UseNpgsql(_connection).AddInterceptors(interceptors).Options);
    private NavigationDbContext Navigation() => new(new DbContextOptionsBuilder<NavigationDbContext>().UseNpgsql(_connection).Options);
    private CodeSequenceDbContext Codes() => new(new DbContextOptionsBuilder<CodeSequenceDbContext>().UseNpgsql(_connection).Options);
    private CreateContainerBatchHandler Handler(WarehouseDbContext db, IBusinessCodeGenerator codes, NavigationDbContext navigation) =>
        new(db, codes, new TestActor(), new CreateContainerValidator(), new MapEndpointCatalog(navigation), Options.Create(_receiving), NullLogger<CreateContainerBatchHandler>.Instance);

    private async Task<WebApplication> ServerAsync()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" });
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddDbContext<WarehouseDbContext>(o => o.UseNpgsql(_connection));
        builder.Services.AddDbContext<NavigationDbContext>(o => o.UseNpgsql(_connection));
        builder.Services.AddDbContext<CodeSequenceDbContext>(o => o.UseNpgsql(_connection));
        builder.Services.AddScoped<IBusinessCodeGenerator, BusinessCodeGenerator>();
        builder.Services.AddScoped<IMapEndpointCatalog, MapEndpointCatalog>();
        builder.Services.AddSingleton(Options.Create(_receiving));
        builder.Services.AddScoped<IValidator<CreateContainerRequest>, CreateContainerValidator>();
        builder.Services.AddScoped<CreateContainerHandler>();
        builder.Services.AddScoped<CreateContainerBatchHandler>();
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<ICurrentUser, CurrentUser>();
        builder.Services.AddSingleton<IAuditTrail, TestAudit>();
        builder.Services.AddAuthentication("BatchTest").AddScheme<AuthenticationSchemeOptions, BatchAuthentication>("BatchTest", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.AddPermissionAuthorization();
        builder.Services.AddProblemDetails();
        builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
        var app = builder.Build();
        app.UseExceptionHandler();
        app.UseAuthentication();
        app.UseAuthorization();
        CreateContainerEndpoint.Map(app.MapGroup("/api/warehouse"));
        await app.StartAsync();
        return app;
    }

    private sealed class InvalidLastContainer : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            eventData.Context!.ChangeTracker.Entries<Container>().OrderBy(e => e.Entity.CreationOrdinal).Last().Entity.ContentsQuantity = -1;
            return ValueTask.FromResult(result);
        }
    }
    private sealed class TestActor : ICurrentUser
    {
        public Guid? AccountId => Guid.Parse("11111111-1111-1111-1111-111111111111");
        public string? Username => "batch-test";
        public string? Role => "STAFF";
        public bool IsAuthenticated => true;
    }
    private sealed class TestAudit : IAuditTrail
    {
        public Task RecordAsync(AuditEntry entry, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
    private sealed class BatchAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (Request.Headers.ContainsKey("X-Anonymous")) return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, new TestActor().AccountId!.Value.ToString()),
                new Claim(ClaimTypes.Role, Request.Headers["X-Role"].FirstOrDefault() ?? "STAFF")], Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}

public sealed class IsolatedPostgresFactAttribute : FactAttribute
{
    public IsolatedPostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(ContainerBatchPostgresTests.ConnectionEnvironment)))
            Skip = $"Requires opt-in isolated PostgreSQL: {ContainerBatchPostgresTests.ConnectionEnvironment}. Creates/drops only its own generated database.";
    }
}

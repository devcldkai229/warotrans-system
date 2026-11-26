using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.UnitTests.Warehouse.Infrastructure;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Features.CatalogEditing;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.UnitTests.Warehouse.Features.CatalogEditing;

public class CatalogEditingTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;

    // ---- Products ----

    [Fact]
    public async Task UpdateProduct_changes_name_category_barcode_and_description_but_keeps_the_sku()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(UpdateProduct_changes_name_category_barcode_and_description_but_keeps_the_sku));
        var (boxes, tools) = (Category(db, "BOX"), Category(db, "TOOL"));
        var product = Product(db, boxes.Id, "SKU-1", "111");
        await db.SaveChangesAsync();
        var audit = new RecordingAudit();

        var result = await ProductHandler(db, audit).HandleAsync(
            product.Id, new UpdateProductRequest(tools.Id, "  New name ", "222", "Heavy"));

        Assert.Equal("SKU-1", result.Sku);
        Assert.Equal("New name", result.Name);
        Assert.Equal(tools.Id, result.CategoryId);
        Assert.Equal("222", result.SupplierBarcode);
        Assert.Equal("Heavy", result.Description);
        var entry = Assert.Single(audit.Entries);
        Assert.Equal("product.updated", entry.Action);
        Assert.Equal("111", entry.Before!["supplierBarcode"]);
        Assert.Equal("222", entry.After!["supplierBarcode"]);
    }

    [Fact]
    public async Task UpdateProduct_refuses_a_barcode_of_another_product()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(UpdateProduct_refuses_a_barcode_of_another_product));
        var category = Category(db, "BOX");
        var product = Product(db, category.Id, "SKU-1", "111");
        Product(db, category.Id, "SKU-2", "222");
        await db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ConflictException>(() =>
            ProductHandler(db, new RecordingAudit()).HandleAsync(product.Id, new UpdateProductRequest(category.Id, "P", "222")));
        Assert.Equal("product_supplier_barcode_taken", error.Code);
    }

    [Fact]
    public async Task UpdateProduct_with_nothing_changed_records_no_audit()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(UpdateProduct_with_nothing_changed_records_no_audit));
        var category = Category(db, "BOX");
        var product = Product(db, category.Id, "SKU-1", "111");
        await db.SaveChangesAsync();
        var audit = new RecordingAudit();

        await ProductHandler(db, audit).HandleAsync(product.Id, new UpdateProductRequest(category.Id, product.Name, "111", null));

        Assert.Empty(audit.Entries);
    }

    [Fact]
    public async Task UpdateProduct_refuses_an_unknown_category()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(UpdateProduct_refuses_an_unknown_category));
        var product = Product(db, Category(db, "BOX").Id, "SKU-1", null);
        await db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<NotFoundException>(() =>
            ProductHandler(db, new RecordingAudit()).HandleAsync(product.Id, new UpdateProductRequest(Guid.NewGuid(), "P")));
        Assert.Equal("product_category_not_found", error.Code);
    }

    // ---- Categories ----

    [Fact]
    public async Task UpdateCategory_changes_name_and_description_only()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(UpdateCategory_changes_name_and_description_only));
        var category = Category(db, "BOX");
        await db.SaveChangesAsync();

        var result = await CategoryHandler(db, new RecordingAudit()).UpdateAsync(category.Id, new UpdateProductCategoryRequest("Boxes", "All boxes"));

        Assert.Equal("BOX", result.Code);
        Assert.Equal("Boxes", result.Name);
        Assert.Equal("All boxes", result.Description);
    }

    [Fact]
    public async Task DeleteCategory_refuses_a_category_that_still_has_products()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(DeleteCategory_refuses_a_category_that_still_has_products));
        var category = Category(db, "BOX");
        Product(db, category.Id, "SKU-1", null);
        await db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ConflictException>(() => CategoryHandler(db, new RecordingAudit()).DeleteAsync(category.Id));
        Assert.Equal("product_category_in_use", error.Code);
        Assert.Single(db.ProductCategories);
    }

    [Fact]
    public async Task DeleteCategory_removes_an_empty_category()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(DeleteCategory_removes_an_empty_category));
        var category = Category(db, "BOX");
        await db.SaveChangesAsync();
        var audit = new RecordingAudit();

        await CategoryHandler(db, audit).DeleteAsync(category.Id);

        Assert.Empty(db.ProductCategories);
        Assert.Equal("product_category.deleted", Assert.Single(audit.Entries).Action);
    }

    // ---- Storage locations ----

    [Fact]
    public async Task UpdateLocation_moves_it_to_a_free_endpoint_of_the_published_map()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(UpdateLocation_moves_it_to_a_free_endpoint_of_the_published_map));
        var (catalog, oldEndpoint, newEndpoint) = Catalog();
        var location = Location(db, oldEndpoint.Id, "SHELF-A");
        await db.SaveChangesAsync();
        var audit = new RecordingAudit();

        var result = await LocationHandler(db, catalog, new FakeContainerTransportLookup(), audit)
            .UpdateAsync(location.Id, new UpdateStorageLocationRequest("Shelf A (new)", newEndpoint.Id));

        Assert.Equal("SHELF-A", result.Code);
        Assert.Equal("Shelf A (new)", result.Name);
        Assert.Equal(newEndpoint.Id, result.EndpointId);
        Assert.Equal(newEndpoint.Code, result.EndpointCode);
        var entry = Assert.Single(audit.Entries);
        Assert.Equal(oldEndpoint.Id, entry.Before!["endpointId"]);
        Assert.Equal(newEndpoint.Id, entry.After!["endpointId"]);
    }

    [Fact]
    public async Task UpdateLocation_refuses_an_endpoint_used_by_another_location()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(UpdateLocation_refuses_an_endpoint_used_by_another_location));
        var (catalog, oldEndpoint, newEndpoint) = Catalog();
        var location = Location(db, oldEndpoint.Id, "SHELF-A");
        Location(db, newEndpoint.Id, "SHELF-B");
        await db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ConflictException>(() =>
            LocationHandler(db, catalog, new FakeContainerTransportLookup(), new RecordingAudit())
                .UpdateAsync(location.Id, new UpdateStorageLocationRequest("Shelf A", newEndpoint.Id)));
        Assert.Equal("endpoint_already_used", error.Code);
    }

    [Fact]
    public async Task UpdateLocation_refuses_an_endpoint_that_is_not_on_the_published_map()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(UpdateLocation_refuses_an_endpoint_that_is_not_on_the_published_map));
        var (catalog, oldEndpoint, _) = Catalog();
        var location = Location(db, oldEndpoint.Id, "SHELF-A");
        await db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<DomainValidationException>(() =>
            LocationHandler(db, catalog, new FakeContainerTransportLookup(), new RecordingAudit())
                .UpdateAsync(location.Id, new UpdateStorageLocationRequest("Shelf A", Guid.NewGuid())));
        Assert.Equal("endpoint_not_on_published_map", error.Code);
    }

    [Fact]
    public async Task UpdateLocation_refuses_a_new_endpoint_while_a_transport_goes_to_or_from_it()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(UpdateLocation_refuses_a_new_endpoint_while_a_transport_goes_to_or_from_it));
        var (catalog, oldEndpoint, newEndpoint) = Catalog();
        var location = Location(db, oldEndpoint.Id, "SHELF-A");
        await db.SaveChangesAsync();
        var transports = new FakeContainerTransportLookup { ActiveTransportsAtLocation = 2 };

        var error = await Assert.ThrowsAsync<ConflictException>(() =>
            LocationHandler(db, catalog, transports, new RecordingAudit())
                .UpdateAsync(location.Id, new UpdateStorageLocationRequest("Shelf A", newEndpoint.Id)));
        Assert.Equal("storage_location_in_transport", error.Code);
        Assert.Equal(oldEndpoint.Id, db.StorageLocations.Single().EndpointId);
    }

    [Fact]
    public async Task UpdateLocation_renames_while_a_transport_runs_when_the_endpoint_stays()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(UpdateLocation_renames_while_a_transport_runs_when_the_endpoint_stays));
        var (catalog, oldEndpoint, _) = Catalog();
        var location = Location(db, oldEndpoint.Id, "SHELF-A");
        await db.SaveChangesAsync();
        var transports = new FakeContainerTransportLookup { ActiveTransportsAtLocation = 1 };

        var result = await LocationHandler(db, catalog, transports, new RecordingAudit())
            .UpdateAsync(location.Id, new UpdateStorageLocationRequest("Renamed", oldEndpoint.Id));

        Assert.Equal("Renamed", result.Name);
    }

    [Fact]
    public async Task GetLocation_tells_an_old_map_endpoint_and_lists_the_stock()
    {
        using var db = WarehouseTestDbContextFactory.Create(nameof(GetLocation_tells_an_old_map_endpoint_and_lists_the_stock));
        var catalog = new FakeReceivingEndpointCatalog();
        var stale = new MapEndpointSnapshot(Guid.NewGuid(), Guid.NewGuid(), "EP-OLD", "Old shelf", "STORAGE", true);
        var location = Location(db, stale.Id, "SHELF-A");
        var product = Product(db, Category(db, "BOX").Id, "SKU-1", null);
        db.InventoryStocks.Add(new InventoryStock
        {
            Id = Guid.NewGuid(), ProductId = product.Id, StorageLocationId = location.Id, LevelNo = 1, ContainerCount = 3, UpdatedAt = Now
        });
        await db.SaveChangesAsync();

        var detail = await LocationHandler(db, catalog, new FakeContainerTransportLookup(), new RecordingAudit()).GetAsync(location.Id);

        Assert.False(detail.OnPublishedMap);
        var stock = Assert.Single(detail.Stock);
        Assert.Equal("SKU-1", stock.Sku);
        Assert.Equal(3, stock.ContainerCount);
    }

    // ---- helpers ----

    private static UpdateProductHandler ProductHandler(WarehouseDbContext db, IAuditTrail audit) =>
        new(db, new UpdateProductValidator(), audit, new FakeCurrentUser(), NullLogger<UpdateProductHandler>.Instance);

    private static ProductCategoryEditingHandler CategoryHandler(WarehouseDbContext db, IAuditTrail audit) =>
        new(db, new UpdateProductCategoryValidator(), audit, new FakeCurrentUser(), NullLogger<ProductCategoryEditingHandler>.Instance);

    private static StorageLocationEditingHandler LocationHandler(
        WarehouseDbContext db, IMapEndpointCatalog catalog, IContainerTransportLookup transports, IAuditTrail audit) =>
        new(db, catalog, transports, new UpdateStorageLocationValidator(), audit, new FakeCurrentUser(),
            NullLogger<StorageLocationEditingHandler>.Instance);

    /// <summary>A published map holding the location's current Endpoint and a free one.</summary>
    private static (FakeReceivingEndpointCatalog Catalog, MapEndpointSnapshot Old, MapEndpointSnapshot New) Catalog()
    {
        var map = Guid.NewGuid();
        var catalog = new FakeReceivingEndpointCatalog();
        var oldEndpoint = new MapEndpointSnapshot(Guid.NewGuid(), map, "EP-A", "Shelf A", "STORAGE", true);
        var newEndpoint = new MapEndpointSnapshot(Guid.NewGuid(), map, "EP-B", "Shelf B", "STORAGE", true);
        catalog.Published.AddRange([oldEndpoint, newEndpoint]);
        return (catalog, oldEndpoint, newEndpoint);
    }

    private static ProductCategory Category(WarehouseDbContext db, string code)
    {
        var category = new ProductCategory { Id = Guid.NewGuid(), Code = code, Name = code };
        db.ProductCategories.Add(category);
        return category;
    }

    private static Product Product(WarehouseDbContext db, Guid categoryId, string sku, string? barcode)
    {
        var product = new Product
        {
            Id = Guid.NewGuid(), CategoryId = categoryId, Sku = sku, Name = sku, SupplierBarcode = barcode,
            IsActive = true, CreatedAt = Now, UpdatedAt = Now
        };
        db.Products.Add(product);
        return product;
    }

    private static StorageLocation Location(WarehouseDbContext db, Guid endpointId, string code)
    {
        var location = new StorageLocation
        {
            Id = Guid.NewGuid(), WarehouseId = Guid.NewGuid(), EndpointId = endpointId, Code = code, Name = code,
            IsActive = true, CreatedAt = Now
        };
        db.StorageLocations.Add(location);
        return location;
    }

    private sealed class RecordingAudit : IAuditTrail
    {
        public List<AuditEntry> Entries { get; } = [];

        public Task RecordAsync(AuditEntry entry, CancellationToken cancellationToken = default)
        {
            Entries.Add(entry);
            return Task.CompletedTask;
        }
    }
}

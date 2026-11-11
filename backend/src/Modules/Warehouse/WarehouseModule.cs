using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Features.AddStockVoucherLines;
using WaroTrans.Warehouse.Features.CancelStockVoucher;
using WaroTrans.Warehouse.Features.ConfirmStockVoucher;
using WaroTrans.Warehouse.Features.CreateContainer;
using WaroTrans.Warehouse.Features.CreateProduct;
using WaroTrans.Warehouse.Features.CreateProductCategory;
using WaroTrans.Warehouse.Features.CreateStockVoucher;
using WaroTrans.Warehouse.Features.CreateStorageLocation;
using WaroTrans.Warehouse.Features.CreateWarehouse;
using WaroTrans.Warehouse.Features.GetContainer;
using WaroTrans.Warehouse.Features.GetProductInventoryContext;
using WaroTrans.Warehouse.Features.GetStockVoucher;
using WaroTrans.Warehouse.Features.ListContainers;
using WaroTrans.Warehouse.Features.ListInventory;
using WaroTrans.Warehouse.Features.ListProductCategories;
using WaroTrans.Warehouse.Features.ListProducts;
using WaroTrans.Warehouse.Features.ListStockVouchers;
using WaroTrans.Warehouse.Features.ListStorageLocations;
using WaroTrans.Warehouse.Features.ListWarehouses;
using WaroTrans.Warehouse.Features.RecoverContainer;
using WaroTrans.Warehouse.Features.RemoveStockVoucherLine;
using WaroTrans.Warehouse.Features.ResolveProduct;
using WaroTrans.Warehouse.Features.SetProductStatus;
using WaroTrans.Warehouse.Features.SetStorageLocationStatus;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.Warehouse.Services;

namespace WaroTrans.Warehouse;

public static class WarehouseModule
{
    public static IServiceCollection AddWarehouseModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<WarehouseDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("PostgreSQL")));

        services.AddValidatorsFromAssembly(typeof(WarehouseModule).Assembly);

        services.AddScoped<ResolveProductHandler>();
        services.AddScoped<CreateContainerHandler>();
        services.AddScoped<CreateWarehouseHandler>();
        services.AddScoped<GetContainerHandler>();
        services.AddScoped<GetProductInventoryContextHandler>();
        services.AddScoped<ListWarehousesHandler>();
        services.AddScoped<ListContainersHandler>();
        services.AddScoped<ListStorageLocationsHandler>();
        services.AddScoped<CreateStorageLocationHandler>();
        services.AddScoped<SetStorageLocationStatusHandler>();
        services.AddScoped<ListInventoryHandler>();
        services.AddScoped<ListProductsHandler>();
        services.AddScoped<CreateProductHandler>();
        services.AddScoped<SetProductStatusHandler>();
        services.AddScoped<ListProductCategoriesHandler>();
        services.AddScoped<CreateProductCategoryHandler>();
        services.AddScoped<CreateStockVoucherHandler>();
        services.AddScoped<ListStockVouchersHandler>();
        services.AddScoped<AddStockVoucherLinesHandler>();
        services.AddScoped<RemoveStockVoucherLineHandler>();
        services.AddScoped<ConfirmStockVoucherHandler>();
        services.AddScoped<CancelStockVoucherHandler>();

        services.AddScoped<IWarehouseModule, WarehouseModuleApi>();
        services.AddScoped<IStorageLocationEndpointRebinder, StorageLocationEndpointRebinder>();
        services.AddScoped<IStoredContainerQuery, StoredContainerQuery>();
        services.AddScoped<ContainerMovementRecorder>();
        services.AddScoped<IContainerMovementRecorder>(sp => sp.GetRequiredService<ContainerMovementRecorder>());
        services.AddScoped<RecoverContainerHandler>();

        return services;
    }

    public static IEndpointRouteBuilder MapWarehouseEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/warehouse");
        group.MapGet("/ping", () => Results.Ok(new { module = "warehouse" })).AllowAnonymous();
        group.MapListWarehouses();
        group.MapCreateWarehouse();
        group.MapListContainers();
        group.MapRecoverContainer();
        Features.ContainerPhysical.ContainerPhysicalEndpoint.MapContainerPhysical(group);
        group.MapListStorageLocations();
        group.MapCreateStorageLocation();
        group.MapSetStorageLocationStatus();
        group.MapListInventory();
        group.MapListProducts();
        group.MapCreateProduct();
        // Receiving: scanned supplier barcode / SKU -> Product, and where that Product is stored.
        ResolveProductEndpoint.Map(group);
        GetProductInventoryContextEndpoint.Map(group);
        group.MapSetProductStatus();
        group.MapListProductCategories();
        group.MapCreateProductCategory();
        group.MapListStockVouchers();
        group.MapGetStockVoucher();
        group.MapCreateStockVoucher();
        group.MapAddStockVoucherLines();
        group.MapRemoveStockVoucherLine();
        group.MapConfirmStockVoucher();
        group.MapCancelStockVoucher();
        GetContainerEndpoint.Map(group);
        // Receiving: was mapped in 3a8dc58 and lost when the module's endpoints were regrouped, so no client could
        // register a container (and therefore never create a Transport Request).
        CreateContainerEndpoint.Map(group);
        return endpoints;
    }
}

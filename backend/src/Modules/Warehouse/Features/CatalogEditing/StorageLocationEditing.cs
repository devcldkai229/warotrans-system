using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Features.ListStorageLocations;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CatalogEditing;

/// <summary>
/// The name, and the map Endpoint robots drive to for this location. The code is not editable. The Endpoint must be on
/// the published map, enabled and free; it cannot change while a Transport Request still goes to or from the location.
/// </summary>
public sealed record UpdateStorageLocationRequest(string Name, Guid EndpointId);

public sealed class UpdateStorageLocationValidator : AbstractValidator<UpdateStorageLocationRequest>
{
    public UpdateStorageLocationValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(100).WithMessage("Name must not exceed 100 characters.");
        RuleFor(x => x.EndpointId).NotEmpty().WithMessage("EndpointId is required.");
    }
}

/// <summary>One product's balance at this location and level.</summary>
public sealed record StorageLocationStockItem(Guid ProductId, string Sku, string ProductName, short LevelNo, int ContainerCount);

/// <param name="OnPublishedMap">False when the Endpoint belongs to an older map version than the published one.</param>
/// <param name="HeldContainers">Containers standing at this location now.</param>
/// <param name="ActiveTransports">Open Transport Request lines going to or from this location.</param>
public sealed record StorageLocationDetailResponse(
    StorageLocationListItemResponse Location,
    Guid? EndpointMapVersionId,
    bool OnPublishedMap,
    int HeldContainers,
    int ActiveTransports,
    IReadOnlyList<StorageLocationStockItem> Stock);

public sealed class StorageLocationEditingHandler(
    WarehouseDbContext dbContext,
    IMapEndpointCatalog endpointCatalog,
    IContainerTransportLookup transports,
    IValidator<UpdateStorageLocationRequest> validator,
    IAuditTrail auditTrail,
    ICurrentUser currentUser,
    ILogger<StorageLocationEditingHandler> logger)
{
    public async Task<StorageLocationDetailResponse> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var location = await dbContext.StorageLocations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == id, cancellationToken)
            ?? throw NotFound(id);

        var endpoint = (await endpointCatalog.GetEndpointsAsync([location.EndpointId], cancellationToken)).FirstOrDefault();
        var published = await endpointCatalog.GetPublishedEndpointsAsync(location.WarehouseId, cancellationToken);
        var held = await dbContext.Containers.CountAsync(c => c.CurrentStorageLocationId == id, cancellationToken);
        var active = await transports.CountActiveTransportsAtLocationAsync(id, location.EndpointId, cancellationToken);
        var stock = await dbContext.InventoryStocks
            .AsNoTracking()
            .Where(s => s.StorageLocationId == id)
            .OrderBy(s => s.Product!.Sku)
            .ThenBy(s => s.LevelNo)
            .Select(s => new StorageLocationStockItem(s.ProductId, s.Product!.Sku, s.Product.Name, s.LevelNo, s.ContainerCount))
            .ToListAsync(cancellationToken);

        return new StorageLocationDetailResponse(
            StorageLocationListItemResponse.From(location, await WarehouseNameAsync(location.WarehouseId, cancellationToken), endpoint),
            endpoint?.MapVersionId,
            published.Any(e => e.Id == location.EndpointId),
            held,
            active,
            stock);
    }

    public async Task<StorageLocationListItemResponse> UpdateAsync(Guid id, UpdateStorageLocationRequest request, CancellationToken cancellationToken = default)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);
        var location = await dbContext.StorageLocations.SingleOrDefaultAsync(l => l.Id == id, cancellationToken)
            ?? throw NotFound(id);

        var name = request.Name.Trim();
        var previousName = location.Name;
        var previousEndpointId = location.EndpointId;
        MapEndpointSnapshot? endpoint;

        if (request.EndpointId == location.EndpointId)
        {
            endpoint = (await endpointCatalog.GetEndpointsAsync([location.EndpointId], cancellationToken)).FirstOrDefault();
        }
        else
        {
            endpoint = (await endpointCatalog.GetPublishedEndpointsAsync(location.WarehouseId, cancellationToken))
                .FirstOrDefault(e => e.Id == request.EndpointId)
                ?? throw new DomainValidationException(
                    "The endpoint is not on the published map of this warehouse.",
                    "endpoint_not_on_published_map");
            if (!endpoint.IsEnabled)
            {
                throw new DomainValidationException($"Endpoint '{endpoint.Code}' is disabled.", "endpoint_disabled");
            }

            if (await dbContext.StorageLocations.AnyAsync(l => l.Id != id && l.EndpointId == endpoint.Id, cancellationToken))
            {
                throw EndpointUsed(endpoint.Code);
            }

            // A robot already sent to the old Endpoint would arrive at the wrong place.
            var active = await transports.CountActiveTransportsAtLocationAsync(id, location.EndpointId, cancellationToken);
            if (active > 0)
            {
                throw new ConflictException(
                    $"Storage location '{location.Code}' has {active} open transport line(s) going to or from it. Change the endpoint once they finish.",
                    "storage_location_in_transport");
            }

            location.EndpointId = endpoint.Id;
        }

        location.Name = name;
        if (previousName == name && previousEndpointId == location.EndpointId)
        {
            return StorageLocationListItemResponse.From(location, await WarehouseNameAsync(location.WarehouseId, cancellationToken), endpoint);
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (UniqueViolation.ConstraintOf(exception) is not null)
        {
            throw EndpointUsed(endpoint?.Code ?? request.EndpointId.ToString());
        }

        await auditTrail.RecordAsync(
            new AuditEntry(
                "storage_location.updated",
                "STORAGE_LOCATION",
                location.Id,
                Before: new Dictionary<string, object?> { ["name"] = previousName, ["endpointId"] = previousEndpointId },
                After: new Dictionary<string, object?> { ["name"] = location.Name, ["endpointId"] = location.EndpointId }),
            cancellationToken);
        logger.LogInformation(
            "Storage location {LocationId} ({Code}) updated by {AccountId}, endpoint {OldEndpoint} -> {NewEndpoint}",
            location.Id,
            location.Code,
            currentUser.AccountId,
            previousEndpointId,
            location.EndpointId);

        return StorageLocationListItemResponse.From(location, await WarehouseNameAsync(location.WarehouseId, cancellationToken), endpoint);
    }

    private async Task<string> WarehouseNameAsync(Guid warehouseId, CancellationToken cancellationToken) =>
        await dbContext.Warehouses.AsNoTracking()
            .Where(w => w.Id == warehouseId)
            .Select(w => w.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;

    private static NotFoundException NotFound(Guid id) =>
        new($"Storage location '{id}' was not found.", "storage_location_not_found");

    private static ConflictException EndpointUsed(string endpointCode) =>
        new($"Endpoint '{endpointCode}' already serves another storage location.", "endpoint_already_used");
}

public static class StorageLocationEditingEndpoints
{
    public static RouteGroupBuilder MapStorageLocationEditing(this RouteGroupBuilder group)
    {
        group.MapGet("/storage-locations/{id:guid}", async (
            Guid id,
            StorageLocationEditingHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.GetAsync(id, cancellationToken)))
        .RequirePermission(Permissions.WarehouseRead)
        .WithName("GetStorageLocation")
        .WithSummary("Get a storage location with its stock")
        .WithDescription("The location, whether its Endpoint is on the published map, the containers it holds and its stock by product.");

        group.MapPut("/storage-locations/{id:guid}", async (
            Guid id,
            UpdateStorageLocationRequest request,
            StorageLocationEditingHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.UpdateAsync(id, request, cancellationToken)))
        .RequirePermission(Permissions.WarehouseWrite)
        .WithName("UpdateStorageLocation")
        .WithSummary("Edit a storage location")
        .WithDescription(
            "Changes the name and the map Endpoint. The code cannot be changed. The new Endpoint must be on the published " +
            "map, enabled and free; refused with storage_location_in_transport while a Transport Request goes to or from it.");

        return group;
    }
}

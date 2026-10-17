using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Features.ListStorageLocations;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CreateStorageLocation;

public sealed class CreateStorageLocationHandler(
    WarehouseDbContext dbContext,
    IMapEndpointCatalog endpointCatalog,
    IValidator<CreateStorageLocationRequest> validator,
    ICurrentUser currentUser,
    ILogger<CreateStorageLocationHandler> logger)
{
    public async Task<StorageLocationListItemResponse> HandleAsync(
        CreateStorageLocationRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var warehouse = await dbContext.Warehouses
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == request.WarehouseId, cancellationToken)
            ?? throw new NotFoundException($"Warehouse '{request.WarehouseId}' was not found.", "warehouse_not_found");

        if (!warehouse.IsActive)
        {
            throw new DomainValidationException($"Warehouse '{warehouse.Code}' is inactive.", "warehouse_inactive");
        }

        var code = request.Code.Trim().ToUpperInvariant();
        if (await dbContext.StorageLocations.AnyAsync(l => l.WarehouseId == warehouse.Id && l.Code == code, cancellationToken))
        {
            throw new ConflictException(
                $"Storage location code '{code}' already exists in warehouse '{warehouse.Code}'.",
                "storage_location_code_taken");
        }

        // storage_locations has no foreign key to the map, so the Endpoint is checked through Navigation.
        var endpoint = (await endpointCatalog.GetPublishedEndpointsAsync(warehouse.Id, cancellationToken))
            .FirstOrDefault(e => e.Id == request.EndpointId)
            ?? throw new DomainValidationException(
                "The endpoint is not on the published map of this warehouse.",
                "endpoint_not_on_published_map");

        if (!endpoint.IsEnabled)
        {
            throw new DomainValidationException($"Endpoint '{endpoint.Code}' is disabled.", "endpoint_disabled");
        }

        if (await dbContext.StorageLocations.AnyAsync(l => l.EndpointId == endpoint.Id, cancellationToken))
        {
            throw EndpointUsed(endpoint.Code);
        }

        var location = new StorageLocation
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouse.Id,
            EndpointId = endpoint.Id,
            Code = code,
            Name = request.Name.Trim(),
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

        dbContext.StorageLocations.Add(location);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (UniqueViolation.ConstraintOf(exception) is not null)
        {
            // Two Admins picking the same Endpoint at once: the only unique index besides the key is on endpoint_id.
            throw EndpointUsed(endpoint.Code);
        }

        logger.LogInformation(
            "Storage location {LocationId} ({Code}) created in warehouse {WarehouseId} by {AccountId}",
            location.Id,
            location.Code,
            warehouse.Id,
            currentUser.AccountId);

        return StorageLocationListItemResponse.From(location, warehouse.Name, endpoint);
    }

    private static ConflictException EndpointUsed(string endpointCode) =>
        new($"Endpoint '{endpointCode}' already serves another storage location.", "endpoint_already_used");
}

using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Persistence;
using WaroTrans.Warehouse.Services;

namespace WaroTrans.Warehouse.Features.RecoverContainer;

public sealed record RecoverContainerRequest(Guid StorageLocationId, short? LevelNo, string? Note);

public sealed record RecoverContainerResponse(Guid Id, string Barcode, string Status, Guid StorageLocationId, short LevelNo);

public sealed class RecoverContainerHandler(
    WarehouseDbContext db,
    ContainerMovementRecorder recorder,
    IContainerTransportLookup transports,
    ICurrentUser currentUser)
{
    public async Task<RecoverContainerResponse> HandleAsync(
        Guid id,
        RecoverContainerRequest request,
        CancellationToken cancellationToken)
    {
        var level = request.LevelNo ?? 1;
        if (level < 1)
        {
            throw new DomainValidationException("Shelf level starts at 1.", "container_level_invalid");
        }

        if (!await db.StorageLocations.AnyAsync(l => l.Id == request.StorageLocationId, cancellationToken))
        {
            throw new NotFoundException($"Storage location '{request.StorageLocationId}' was not found.", "storage_location_not_found");
        }

        var moving = await transports.GetContainersInActiveTransportAsync([id], cancellationToken);
        if (moving.Contains(id))
        {
            throw new ConflictException(
                "An open Transport Request is still moving this Container; finish or cancel its Job first.",
                "container_in_active_transport");
        }

        await recorder.RecoverAsync(id, request.StorageLocationId, level, request.Note, currentUser.AccountId, cancellationToken);

        var container = await db.Containers.AsNoTracking().FirstAsync(c => c.Id == id, cancellationToken);
        return new RecoverContainerResponse(container.Id, container.Barcode, container.Status.ToString(), request.StorageLocationId, level);
    }
}

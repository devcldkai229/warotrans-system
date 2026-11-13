using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CreateContainer;

/// <summary>Creates a complete batch at configured Inbound, atomically, without stock posting or a voucher side effect.</summary>
public sealed class CreateContainerBatchHandler(
    WarehouseDbContext db,
    IBusinessCodeGenerator codes,
    ICurrentUser user,
    IValidator<CreateContainerRequest> validator,
    IMapEndpointCatalog navigation,
    IOptions<ReceivingOptions> options,
    ILogger<CreateContainerBatchHandler> logger)
{
    public async Task<CreateContainerBatchResponse> HandleAsync(CreateContainerRequest request, CancellationToken cancellationToken = default)
    {
        var validation = await validator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid) throw new ValidationException(validation.Errors);
        if (request.Groups is null) throw new DomainValidationException("Groups is required.", "container_request_shape_invalid");
        if (!user.IsAuthenticated || user.AccountId is not { } actor || actor == Guid.Empty)
            throw new AppException("An authenticated account is required.", 401, "unauthenticated");
        if (!user.Can(Permissions.ContainerCreate)) throw new AppException("Container creation is not allowed.", 403, "forbidden");

        var rows = Expand(request);
        var fingerprint = Fingerprint(request, rows);
        // Replay precedes changing Product/configuration/readiness checks: the operation already happened.
        var replay = await FindReceiptAsync(request, actor, fingerprint, rows.Count, cancellationToken);
        if (replay is not null) return replay;

        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(cancellationToken) : null;
        try
        {
            var warehouseId = request.WarehouseId!.Value;
            if (!await db.Warehouses.AsNoTracking().AnyAsync(w => w.Id == warehouseId && w.IsActive, cancellationToken))
                throw new NotFoundException("The warehouse was not found or is inactive.", "warehouse_not_found");
            var location = await ReceivingLocationAsync(request, cancellationToken);
            var productIds = rows.Select(row => row.ProductId).Distinct().Order().ToArray();
            // Hold existing Product rows against concurrent deactivation through the one batch commit.
            var products = db.Database.IsNpgsql()
                ? await db.Products.FromSqlInterpolated($"SELECT * FROM warehouse.products WHERE id = ANY({productIds}) ORDER BY id FOR SHARE").AsNoTracking().ToListAsync(cancellationToken)
                : await db.Products.AsNoTracking().Where(p => productIds.Contains(p.Id)).ToListAsync(cancellationToken);
            if (products.Count != productIds.Length || products.Any(p => !p.IsActive))
                throw new NotFoundException("A batch product was not found or is inactive.", "product_not_found");
            var byId = products.ToDictionary(p => p.Id);
            var now = DateTimeOffset.UtcNow;
            var barcodes = await codes.NextContainerCodesAsync(rows.Count, DateOnly.FromDateTime(now.UtcDateTime), cancellationToken);
            if (barcodes.Count != rows.Count || barcodes.Any(code => string.IsNullOrWhiteSpace(code) || code.Length > 100)
                || barcodes.Distinct(StringComparer.Ordinal).Count() != rows.Count)
                throw new InvalidOperationException("The code generator did not provide a distinct code for every container.");

            var containers = rows.Select((row, index) => new Container
            {
                Id = Guid.NewGuid(), ProductId = row.ProductId, Barcode = barcodes[index],
                SupplierPackageBarcode = row.SupplierBarcode ?? byId[row.ProductId].SupplierBarcode,
                ContentsQuantity = row.Quantity, ContentsUnit = row.Unit,
                CurrentStorageLocationId = location.Id, CurrentLevelNo = null,
                Status = ContainerStatus.CREATED, CreatedBy = actor, CreatedAt = now, UpdatedAt = now,
                CreationRequestId = request.RequestId, CreationRequestHash = fingerprint, CreationOrdinal = index + 1,
                CreationGroupKey = row.GroupKey, CreationGroupOrdinal = row.ContainerNo
            }).ToList();
            db.Containers.AddRange(containers);
            // One SaveChanges/transaction owns the complete batch. No InventoryStock, TR, Job or voucher write.
            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);
            logger.LogInformation("Created receiving request {RequestId}, {Count} containers in warehouse {WarehouseId} by {AccountId}", request.RequestId, rows.Count, warehouseId, actor);
            return Response(request, containers, new Dictionary<Guid, Guid> { [location.Id] = location.EndpointId }, false);
        }
        catch (DbUpdateException exception) when (UniqueViolation.ConstraintOf(exception) == "ux_containers_creation_request")
        {
            // The unique receipt ordinal arbitrates simultaneous requests, including a first request for the key.
            if (transaction is not null) await transaction.RollbackAsync(CancellationToken.None);
            db.ChangeTracker.Clear();
            return await FindReceiptAsync(request, actor, fingerprint, rows.Count, cancellationToken)
                ?? throw new ConflictException("The receiving request changed. Retry using the same RequestId.", "container_creation_request_conflict");
        }
    }

    private async Task<StorageLocation> ReceivingLocationAsync(CreateContainerRequest request, CancellationToken cancellationToken)
    {
        if (!options.Value.InboundStorageLocations.TryGetValue(request.WarehouseId!.Value.ToString(), out var locationId) || locationId == Guid.Empty)
            throw new ConflictException("An inbound storage location has not been configured for this warehouse.", "inbound_location_not_configured");
        if (request.InitialStorageLocationId.HasValue && request.InitialStorageLocationId != locationId)
            throw new DomainValidationException("Use the warehouse's configured inbound location.", "container_receiving_location_mismatch");
        var location = await db.StorageLocations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, cancellationToken);
        if (location is null || !location.IsActive || location.WarehouseId != request.WarehouseId)
            throw new ConflictException("The configured inbound storage location is unavailable or belongs to another warehouse.", "inbound_location_invalid");
        var endpoints = await navigation.GetPublishedEndpointsAsync(request.WarehouseId.Value, cancellationToken);
        var endpoint = endpoints.SingleOrDefault(e => e.Id == location.EndpointId);
        if (endpoint is null || !endpoint.IsEnabled || endpoint.EndpointType != "WAYPOINT")
            throw new ConflictException("The inbound endpoint must be enabled on the warehouse's active published map.", "inbound_endpoint_unavailable");
        return location;
    }

    private async Task<CreateContainerBatchResponse?> FindReceiptAsync(CreateContainerRequest request, Guid actor, string hash, int count, CancellationToken cancellationToken)
    {
        var existing = await db.Containers.AsNoTracking().Where(c => c.CreationRequestId == request.RequestId)
            .OrderBy(c => c.CreationOrdinal).ToListAsync(cancellationToken);
        if (existing.Count == 0) return null;
        if (existing.Any(c => c.CreatedBy != actor || c.CreationRequestHash != hash))
            throw new ConflictException("RequestId has already been used by a different receiving request.", "container_creation_request_conflict");
        if (existing.Count != count || !existing.Select(c => c.CreationOrdinal).SequenceEqual(Enumerable.Range(1, count).Select(i => (int?)i)))
            throw new ConflictException("The receiving receipt is incomplete; reconcile it before creating another batch.", "container_creation_receipt_incomplete");
        var locationIds = existing.Where(c => c.CurrentStorageLocationId.HasValue).Select(c => c.CurrentStorageLocationId!.Value).Distinct().ToArray();
        var endpoints = await db.StorageLocations.AsNoTracking().Where(l => locationIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.EndpointId, cancellationToken);
        return Response(request, existing, endpoints, true);
    }

    private static CreateContainerBatchResponse Response(CreateContainerRequest request, IReadOnlyList<Container> containers, IReadOnlyDictionary<Guid, Guid> endpoints, bool replayed) =>
        new(request.RequestId!.Value, request.WarehouseId!.Value, containers.Count, replayed,
            containers.Select(c => new CreatedContainerBatchItem(c.Id, c.Barcode, c.ProductId, c.CreationGroupKey!, c.CreationGroupOrdinal!.Value,
                c.ContentsQuantity!.Value, c.ContentsUnit!, c.SupplierPackageBarcode, c.Status.ToString(), c.CurrentStorageLocationId,
                c.CurrentStorageLocationId is { } id && endpoints.TryGetValue(id, out var endpoint) ? endpoint : null, c.CreatedAt)).ToList());

    private static List<PlannedContainer> Expand(CreateContainerRequest request)
    {
        var result = new List<PlannedContainer>();
        foreach (var group in request.Groups!)
        {
            var overrides = group!.QuantityOverrides?.ToDictionary(item => item!.ContainerNo, item => item!.Quantity) ?? [];
            for (var number = 1; number <= group.ContainerCount; number++)
                result.Add(new(group.GroupKey.Trim(), number, group.ProductId,
                    overrides.TryGetValue(number, out var quantity) ? quantity : group.QuantityPerContainer,
                    group.Unit.Trim(), string.IsNullOrWhiteSpace(group.SupplierPackageBarcode) ? null : group.SupplierPackageBarcode.Trim()));
        }
        return result;
    }

    private static string Fingerprint(CreateContainerRequest request, IEnumerable<PlannedContainer> rows)
    {
        // Hash effective quantities, not JSON decimal scale or override ordering. Scope/location are part of intent.
        var normalized = JsonSerializer.Serialize(new { request.WarehouseId, request.InitialStorageLocationId,
            Rows = rows.Select(row => new { row.GroupKey, row.ContainerNo, row.ProductId, Quantity = row.Quantity.ToString("G29", CultureInfo.InvariantCulture), row.Unit, row.SupplierBarcode }) });
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized)));
    }

    private sealed record PlannedContainer(string GroupKey, int ContainerNo, Guid ProductId, decimal Quantity, string Unit, string? SupplierBarcode);
}

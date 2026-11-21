using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CreateContainer;

/// <summary>Creates a complete batch without assigning a physical location, atomically, optionally attaching every new box to one DRAFT inbound voucher. No stock posting.</summary>
public sealed class CreateContainerBatchHandler(
    WarehouseDbContext db,
    IBusinessCodeGenerator codes,
    ICurrentUser user,
    IValidator<CreateContainerRequest> validator,
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

        if (request.StockVoucherId.HasValue && !user.Can(Permissions.VoucherWrite))
            throw new AppException("Voucher writing is not allowed.", 403, "forbidden");

        var rows = Expand(request);
        var fingerprint = Fingerprint(request, rows);
        // Replay precedes changing Product/configuration/readiness checks: the operation already happened.
        var replay = await FindReceiptAsync(request, actor, fingerprint, rows.Count, cancellationToken);
        if (replay is not null) return replay;

        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(cancellationToken) : null;
        try
        {
            // Serialize the request before allocating labels or inserting its set of unique receipt ordinals.
            await WarehouseWriteLocks.ReceivingRequestAsync(db, request.RequestId!.Value, cancellationToken);
            replay = await FindReceiptAsync(request, actor, fingerprint, rows.Count, cancellationToken);
            if (replay is not null) return replay;

            StockVoucher? voucher = null;
            if (request.StockVoucherId is { } voucherId)
            {
                voucher = await WarehouseWriteLocks.VoucherAsync(db, voucherId, cancellationToken);
                // A host that only holds the voucher lock can have committed while this request waited.
                replay = await FindReceiptAsync(request, actor, fingerprint, rows.Count, cancellationToken);
                if (replay is not null) return replay;
                if (voucher.Type != StockVoucherType.INBOUND)
                    throw new DomainValidationException("The batch requires an INBOUND voucher.", "voucher_not_inbound");
                if (voucher.Status != StockVoucherStatus.DRAFT)
                    throw new ConflictException("The receiving voucher must be DRAFT.", "voucher_not_draft");
                if (voucher.WarehouseId != request.WarehouseId)
                    throw new DomainValidationException("The voucher belongs to another warehouse.", "voucher_container_wrong_warehouse");
            }
            var warehouseId = request.WarehouseId!.Value;
            if (!await db.Warehouses.AsNoTracking().AnyAsync(w => w.Id == warehouseId && w.IsActive, cancellationToken))
                throw new NotFoundException("The warehouse was not found or is inactive.", "warehouse_not_found");
            if (request.InitialStorageLocationId.HasValue)
                throw new DomainValidationException("Select an Inbound gate during putaway. Batch registration has no initial location.", "batch_initial_location_not_supported");
            var productIds = rows.Select(row => row.ProductId).Distinct().Order().ToArray();
            // Hold existing Product rows against concurrent deactivation through the one batch commit.
            var products = db.Database.IsNpgsql()
                ? await db.Products.FromSqlInterpolated($"SELECT * FROM warehouse.products WHERE id = ANY({productIds}) ORDER BY id FOR SHARE").AsNoTracking().ToListAsync(cancellationToken)
                : await db.Products.AsNoTracking().Where(p => productIds.Contains(p.Id)).ToListAsync(cancellationToken);
            if (products.Count != productIds.Length || products.Any(p => !p.IsActive))
                throw new NotFoundException("A batch product was not found or is inactive.", "product_not_found");
            var byId = products.ToDictionary(p => p.Id);
            var now = DateTimeOffset.UtcNow;
            var barcodes = request.LabelBarcode is { } label
                ? await ClaimLabelAsync(label.Trim(), cancellationToken)
                : await codes.NextContainerCodesAsync(rows.Count, DateOnly.FromDateTime(now.UtcDateTime), cancellationToken);
            if (barcodes.Count != rows.Count || barcodes.Any(code => string.IsNullOrWhiteSpace(code) || code.Length > 100)
                || barcodes.Distinct(StringComparer.Ordinal).Count() != rows.Count)
                throw new InvalidOperationException("The code generator did not provide a distinct code for every container.");

            var containers = rows.Select((row, index) => new Container
            {
                Id = Guid.NewGuid(), ProductId = row.ProductId, Barcode = barcodes[index],
                SupplierPackageBarcode = row.SupplierBarcode ?? byId[row.ProductId].SupplierBarcode,
                ContentsQuantity = row.Quantity, ContentsUnit = row.Unit,
                WarehouseId = warehouseId,
                Status = ContainerStatus.CREATED, CreatedBy = actor, CreatedAt = now, UpdatedAt = now,
                CreationRequestId = request.RequestId, CreationRequestHash = fingerprint, CreationOrdinal = index + 1,
                CreationGroupKey = row.GroupKey, CreationGroupOrdinal = row.ContainerNo, CreationStockVoucherId = request.StockVoucherId
            }).ToList();
            db.Containers.AddRange(containers);
            if (voucher is not null)
                db.StockVoucherLines.AddRange(voucher.AddLines(containers, now));
            // Containers, lines and voucher version are committed together. No inventory, TR or Job write.
            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);
            logger.LogInformation("Created receiving request {RequestId}, {Count} containers in warehouse {WarehouseId} by {AccountId}", request.RequestId, rows.Count, warehouseId, actor);
            var detail = voucher is null ? null : await StockVoucherQueries.LoadDetailAsync(db, voucher.Id, cancellationToken);
            return Response(request, containers, new Dictionary<Guid, Guid>(), false, detail);
        }
        catch (DbUpdateException exception) when (request.LabelBarcode is not null
            && UniqueViolation.ConstraintOf(exception) is { } constraint && constraint.Contains("barcode", StringComparison.OrdinalIgnoreCase))
        {
            // Two phones scanning the same label: the unique barcode decides, the second is told it is taken.
            if (transaction is not null) await transaction.RollbackAsync(CancellationToken.None);
            db.ChangeTracker.Clear();
            throw new ConflictException($"Label {request.LabelBarcode.Trim()} is already on a container.", "label_already_used");
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

    /// <summary>A scanned pre-printed label: issued by the daily sequence and not on any container yet.</summary>
    private async Task<IReadOnlyList<string>> ClaimLabelAsync(string label, CancellationToken cancellationToken)
    {
        if (!await codes.IsIssuedContainerCodeAsync(label, cancellationToken))
            throw new DomainValidationException($"{label} is not a container label issued by WaroTrans.", "label_not_issued");
        if (await db.Containers.AsNoTracking().AnyAsync(c => c.Barcode == label, cancellationToken))
            throw new ConflictException($"Label {label} is already on a container.", "label_already_used");
        return [label];
    }

    private async Task<CreateContainerBatchResponse?> FindReceiptAsync(CreateContainerRequest request, Guid actor, string hash, int count, CancellationToken cancellationToken)
    {
        var existing = await db.Containers.AsNoTracking().Where(c => c.CreationRequestId == request.RequestId)
            .OrderBy(c => c.CreationOrdinal).ToListAsync(cancellationToken);
        if (existing.Count == 0) return null;
        if (existing.Any(c => c.CreatedBy != actor || c.CreationRequestHash != hash || c.CreationStockVoucherId != request.StockVoucherId))
            throw new ConflictException("RequestId has already been used by a different receiving request.", "container_creation_request_conflict");
        if (existing.Count != count || !existing.Select(c => c.CreationOrdinal).SequenceEqual(Enumerable.Range(1, count).Select(i => (int?)i)))
            throw new ConflictException("The receiving receipt is incomplete; reconcile it before creating another batch.", "container_creation_receipt_incomplete");
        var locationIds = existing.Where(c => c.CurrentStorageLocationId.HasValue).Select(c => c.CurrentStorageLocationId!.Value).Distinct().ToArray();
        var endpoints = await db.StorageLocations.AsNoTracking().Where(l => locationIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.EndpointId, cancellationToken);
        var detail = request.StockVoucherId is { } voucherId ? await StockVoucherQueries.LoadDetailAsync(db, voucherId, cancellationToken) : null;
        return Response(request, existing, endpoints, true, detail);
    }

    private static CreateContainerBatchResponse Response(CreateContainerRequest request, IReadOnlyList<Container> containers, IReadOnlyDictionary<Guid, Guid> endpoints, bool replayed, StockVoucherDetailResponse? voucher = null) =>
        new(request.RequestId!.Value, request.WarehouseId!.Value, containers.Count, replayed,
            containers.Select(c => new CreatedContainerBatchItem(c.Id, c.Barcode, c.ProductId, c.CreationGroupKey!, c.CreationGroupOrdinal!.Value,
                c.ContentsQuantity!.Value, c.ContentsUnit!, c.SupplierPackageBarcode, c.Status.ToString(), c.CurrentStorageLocationId,
                c.CurrentStorageLocationId is { } id && endpoints.TryGetValue(id, out var endpoint) ? endpoint : c.CurrentEndpointId, c.CreatedAt)).ToList(), voucher);

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
        var effectiveRows = rows.Select(row => new { row.GroupKey, row.ContainerNo, row.ProductId, Quantity = row.Quantity.ToString("G29", CultureInfo.InvariantCulture), row.Unit, row.SupplierBarcode });
        // Preserve hashes of pre-existing unlinked receipts. Only linked requests add the voucher to intent.
        var normalized = request.StockVoucherId is null
            ? JsonSerializer.Serialize(new { request.WarehouseId, request.InitialStorageLocationId, Rows = effectiveRows })
            : JsonSerializer.Serialize(new { request.WarehouseId, request.InitialStorageLocationId, request.StockVoucherId, Rows = effectiveRows });
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized)));
    }

    private sealed record PlannedContainer(string GroupKey, int ContainerNo, Guid ProductId, decimal Quantity, string Unit, string? SupplierBarcode);
}

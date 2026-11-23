using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Entities;

public sealed class Container
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public string Barcode { get; set; } = string.Empty;
    public string? SupplierPackageBarcode { get; set; }

    // Descriptive goods inside a box, not InventoryStock.ContainerCount. Null means unknown on legacy rows.
    public decimal? ContentsQuantity { get; set; }
    public string? ContentsUnit { get; set; }

    // Durable creation receipt on the created rows, avoiding a separate receiving-batch domain/table.
    public Guid? CreationRequestId { get; set; }
    public string? CreationRequestHash { get; set; }
    public int? CreationOrdinal { get; set; }
    public string? CreationGroupKey { get; set; }
    public int? CreationGroupOrdinal { get; set; }
    public Guid? CreationStockVoucherId { get; set; }
    // Admission is separate from physical custody. The accounting slot is retained while a robot carries the box.
    public Guid? InboundStockVoucherId { get; set; }
    public Guid? InventoryStorageLocationId { get; set; }
    public short? InventoryLevelNo { get; set; }
    public Guid? WarehouseId { get; set; }
    public Guid? CurrentEndpointId { get; set; }
    public ContainerStatus Status { get; set; }
    public Guid? CurrentStorageLocationId { get; set; }
    public short? CurrentLevelNo { get; set; }

    /// <summary>
    /// Why it is held: a container problem code while an issue about it is open (HOLD, or still carried and held once
    /// delivered), <see cref="OffShelfHoldReason"/> when it was set down where no shelf is, null otherwise.
    /// </summary>
    public string? HoldReasonCode { get; set; }

    /// <summary>The issue that holds it: only that issue's resolution releases it.</summary>
    public Guid? HoldIssueId { get; set; }

    public DateTimeOffset? HeldAt { get; set; }

    /// <summary>Where a held container stands when it is on no shelf: the gate or the inspection point it was set down at.</summary>
    public Guid? HoldEndpointId { get; set; }

    public const string OffShelfHoldReason = "OFF_SHELF";

    /// <summary>Held for a problem with the container itself (not merely set down off a shelf).</summary>
    public bool HeldForProblem => HoldReasonCode is not null && HoldReasonCode != OffShelfHoldReason;

    /// <summary>FL-03: measured, null until someone enters it.</summary>
    public decimal? WeightKg { get; set; }
    public double? LengthM { get; set; }
    public double? WidthM { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Product? Product { get; set; }
    public StorageLocation? CurrentStorageLocation { get; set; }

    public void Reserve()
    {
        if (Status != ContainerStatus.CREATED)
        {
            throw new DomainValidationException(
                $"Container can only be reserved from CREATED (current: {Status}).",
                "container_invalid_status");
        }

        Status = ContainerStatus.RESERVED;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}

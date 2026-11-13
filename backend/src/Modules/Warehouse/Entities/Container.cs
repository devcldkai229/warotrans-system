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
    public ContainerStatus Status { get; set; }
    public Guid? CurrentStorageLocationId { get; set; }
    public short? CurrentLevelNo { get; set; }

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

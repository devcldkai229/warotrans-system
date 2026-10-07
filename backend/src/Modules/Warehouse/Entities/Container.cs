using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Entities;

public sealed class Container
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public string Barcode { get; set; } = string.Empty;
    public string? SupplierPackageBarcode { get; set; }
    public ContainerStatus Status { get; set; }
    public Guid? CurrentStorageLocationId { get; set; }
    public short? CurrentLevelNo { get; set; }
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

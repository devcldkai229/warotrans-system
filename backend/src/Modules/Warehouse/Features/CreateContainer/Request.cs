using System.Text.Json.Serialization;

namespace WaroTrans.Warehouse.Features.CreateContainer;

/// <summary>
/// With Groups absent, preserves the original single-Container request. Groups selects full batch receiving;
/// ProductId and the other legacy-only fields must then be absent. No stock is posted by either shape.
/// </summary>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateContainerRequest(
    Guid? ProductId = null,
    string? SupplierPackageBarcode = null,
    Guid? InitialStorageLocationId = null,
    short? InitialLevelNo = null,
    Guid? StockVoucherId = null,
    Guid? WarehouseId = null,
    Guid? RequestId = null,
    int? ContainerCount = null,
    IReadOnlyList<CreateContainerGroupRequest?>? Groups = null);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateContainerGroupRequest(
    string GroupKey,
    Guid ProductId,
    int ContainerCount,
    decimal QuantityPerContainer,
    string Unit,
    IReadOnlyList<ContainerQuantityOverride?>? QuantityOverrides = null,
    string? SupplierPackageBarcode = null);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ContainerQuantityOverride(int ContainerNo, decimal Quantity);

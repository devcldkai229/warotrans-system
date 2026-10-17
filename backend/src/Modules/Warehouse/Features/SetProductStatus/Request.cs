namespace WaroTrans.Warehouse.Features.SetProductStatus;

/// <summary>
/// An inactive product cannot get new Containers; Containers that already exist are not touched.
/// </summary>
public sealed record SetProductStatusRequest(bool IsActive);
